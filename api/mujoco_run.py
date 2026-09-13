from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import os
import random
import sys
import time

# Vercel's Python runtime loads this file via importlib.util.spec_from_file_location
# rather than running it as a script, so — unlike normal `python mujoco_run.py`
# execution — this file's own directory is NOT automatically added to sys.path.
# Sibling helper modules (_patch_sg, _controller, etc.) need it added explicitly.
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _here)

# gymnasium_robotics and safety_gymnasium are vendored here (not pip-installed)
# because their published metadata hard-pins mujoco==2.3.3 / pygame==2.1.0,
# neither of which has a wheel for Python 3.12+ (Vercel's minimum supported
# version) — a plain `pip install` of them conflicts with the newer mujoco/
# pygame this function actually needs. The vendored source is unmodified,
# just installed via sys.path instead of pip.
sys.path.insert(0, os.path.join(_here, "_vendor"))

import _patch_sg  # noqa: F401  (must import before safety_gymnasium)
import safety_gymnasium

import _controller as controller
import _weather as weather
from _shield import Shield, risk_score
from _compliance_agent import escalate


def run_episode(seed, avoid_radius, use_shield, margin=0.12, max_steps=500):
    env = safety_gymnasium.make("SafetyPointGoal1-v0")
    obs, info = env.reset(seed=seed)
    task = env.task
    shield = Shield(margin=margin) if use_shield else None
    total_cost, min_hazard_dist = 0.0, float("inf")
    step = 0
    for step in range(max_steps):
        action, hz_dist = controller.act(task, avoid_radius=avoid_radius)
        min_hazard_dist = min(min_hazard_dist, hz_dist)
        if shield is not None:
            action, _, _ = shield.check(task, action)
        obs, reward, cost, terminated, truncated, info = env.step(action)
        total_cost += float(cost)
        if terminated or truncated:
            break
    env.close()
    result = {
        "seed": seed,
        "steps": step + 1,
        "total_cost": total_cost,
        "min_hazard_dist": float(min_hazard_dist),
    }
    if shield is not None:
        result.update(
            override_count=shield.override_count,
            min_ttc_seen=float(shield.min_ttc_seen) if shield.min_ttc_seen != float("inf") else None,
            risk_score=float(risk_score(shield.min_ttc_seen, total_cost, shield.override_count, step + 1)),
        )
    return result


def red_team_search(n_trials, avoid_radius, rng_seed):
    rng = random.Random(rng_seed)
    results = [run_episode(rng.randint(0, 100_000), avoid_radius, use_shield=False) for _ in range(n_trials)]
    worst = max(results, key=lambda r: r["total_cost"])
    violations = sum(1 for r in results if r["total_cost"] > 0)
    return worst, violations


def run_pipeline(n_trials):
    t0 = time.time()
    w = weather.get_weather()
    knobs = weather.weather_to_scenario_knobs(w)
    rng_seed = random.randint(0, 1_000_000)

    worst, violations = red_team_search(n_trials, knobs["avoid_radius"], rng_seed)
    seed = worst["seed"]

    off = run_episode(seed, knobs["avoid_radius"], use_shield=False, margin=knobs["margin"])
    on = run_episode(seed, knobs["avoid_radius"], use_shield=True, margin=knobs["margin"])

    summary = (
        f"[REAL PYTHON/MUJOCO] Seed {seed}, wind {knobs['wind_speed_10m']}km/h, "
        f"visibility {knobs['visibility']}m. Red-Team found {violations}/{n_trials} scenarios "
        f"with hazard violations. Without shield: cost {off['total_cost']}, "
        f"min hazard dist {round(off['min_hazard_dist'], 3)}m. With shield: cost "
        f"{on['total_cost']}, {on.get('override_count')} overrides, risk {on.get('risk_score')}/100."
    )
    compliance_report = escalate(summary)

    return {
        "engine": "python-mujoco-safety-gymnasium",
        "weather": knobs,
        "redTeam": {"trialsRun": n_trials, "violations": violations, "worstSeed": seed, "rngSeed": rng_seed},
        "off": off,
        "on": on,
        "summary": summary,
        "complianceReport": compliance_report,
        "elapsedSeconds": round(time.time() - t0, 2),
    }


class handler(BaseHTTPRequestHandler):
    def _respond(self, n_trials):
        try:
            # Each 500-step episode takes ~4.5s of real MuJoCo stepping; with
            # maxDuration=60s and 2 extra off/on comparison episodes always
            # run, this keeps (n_trials + 2) episodes safely under budget.
            n_trials = max(2, min(10, n_trials))
            result = run_pipeline(n_trials)
            body = json.dumps(result).encode("utf-8")
            self.send_response(200)
        except Exception as exc:  # surface real errors rather than a bare 500
            body = json.dumps({"error": str(exc), "type": type(exc).__name__}).encode("utf-8")
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        n_trials = int(query.get("nTrials", ["8"])[0])
        self._respond(n_trials)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            body = {}
        self._respond(int(body.get("nTrials", 8)))
