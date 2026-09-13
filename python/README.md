# Phronesis — Python/MuJoCo reference prototype

This is the original implementation, run and verified against real MuJoCo
physics via `safety-gymnasium` (`SafetyPointGoal1-v0`) rather than the
from-scratch TypeScript physics in the deployed [web app](../). It's the
reference build the web app's simulation logic was ported from.

## Run it

```bash
python -m venv aegis-env
source aegis-env/Scripts/activate   # Windows: aegis-env\Scripts\activate
pip install -r requirements.txt
python main.py
```

`GROQ_API_KEY` and `SLACK_WEBHOOK_URL` are read from the environment; without
them, `main.py` prints what it would have sent instead of failing.

## Known Windows install issue

The versions `safety-gymnasium==1.0.0` itself requires (`pygame==2.1.0`,
`mujoco==2.3.3`) have **no prebuilt Windows wheels** for a current Python —
pip falls back to building from source, which fails without a native MuJoCo
install and MSYS2. `requirements.txt` here is a full `pip freeze` of a working
set instead (`pygame==2.6.1`, `mujoco==3.1.6`, installed with `--no-deps`,
plus `pettingzoo`/`jinja2` which `gymnasium_robotics`'s plugin loader needs
but doesn't declare) — a plain `pip install -r requirements.txt` reproduces
it without hitting any of the above. Linux (including Vercel's Python
runtime) is unaffected — the originally pinned versions have manylinux
wheels there.

There's also a real bug in `safety-gymnasium==1.0.0` itself: it fails on
import with `ValueError: mutable default <class 'numpy.ndarray'>...`, from a
dataclass field defaulting to a numpy array. `patch_sg.py` works around it by
monkeypatching `dataclasses._get_field` before `safety_gymnasium` is
imported — every entry-point script imports it first for this reason.

## Files

| File | Role |
|---|---|
| `patch_sg.py` | Workaround for the `safety-gymnasium` import bug (see above) |
| `controller.py` | The policy under test — PD control with a reactive-only hazard-avoidance blind spot |
| `shield.py` | Physics-Grounded Shield — time-to-collision override, steers away rather than braking |
| `red_team.py` | Red-Team agent — searches seeds for a worst-case failure scenario |
| `weather.py` | Live weather grounding via Open-Meteo (no key required) |
| `compliance_agent.py` | Compliance agent — drafts a report via Groq, escalates to Slack |
| `evidence_log.py` | SQLite evidence log schema and writer |
| `main.py` | Wires every stage together into one run |
