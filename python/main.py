import patch_sg  # noqa: F401
import safety_gymnasium
import compliance_agent, controller, evidence_log, red_team, weather
from shield import Shield, risk_score


def run_episode(seed, avoid_radius, use_shield, max_steps=500):
    env = safety_gymnasium.make("SafetyPointGoal1-v0")
    obs, info = env.reset(seed=seed)
    task = env.task
    shield = Shield(margin=avoid_radius * 0.2) if use_shield else None
    total_cost, min_hazard_dist = 0.0, float("inf")
    for step in range(max_steps):
        action, hz_dist = controller.act(task, avoid_radius=avoid_radius)
        min_hazard_dist = min(min_hazard_dist, hz_dist)
        if shield is not None:
            action, _, _ = shield.check(task, action)
        obs, reward, cost, terminated, truncated, info = env.step(action)
        total_cost += cost
        if terminated or truncated:
            break
    env.close()
    result = {"seed": seed, "steps": step + 1, "total_cost": total_cost, "min_hazard_dist": min_hazard_dist}
    if shield is not None:
        result.update(override_count=shield.override_count, min_ttc_seen=shield.min_ttc_seen,
                       risk_score=risk_score(shield.min_ttc_seen, total_cost, shield.override_count, step + 1))
    return result


def main():
    print("[Phronesis] Grounding scenario knobs in live weather (Open-Meteo)...")
    w = weather.get_weather()
    knobs = weather.weather_to_scenario_knobs(w)
    print(f"[Phronesis] wind={knobs['wind_speed_10m']}km/h visibility={knobs['visibility']}m "
          f"-> avoid_radius={knobs['avoid_radius']:.3f} margin={knobs['margin']:.3f}")

    print("[Phronesis] Red-Team agent searching 40 seeds for a failure scenario...")
    worst, all_results = red_team.search(n_trials=40, avoid_radius=knobs["avoid_radius"])
    n_violations = sum(1 for r in all_results if r["total_cost"] > 0)
    print(f"[Phronesis] Red-Team found {n_violations}/40 scenarios with hazard violations. "
          f"Worst: seed={worst['seed']} cost={worst['total_cost']}")

    off = run_episode(worst["seed"], knobs["avoid_radius"], use_shield=False)
    on = run_episode(worst["seed"], knobs["avoid_radius"], use_shield=True)
    print("shield OFF:", off)
    print("shield ON: ", on)

    conn = evidence_log.init_db()
    evidence_log.log_trial(conn, seed=worst["seed"], shielded=False, scenario=knobs,
                            steps=off["steps"], total_cost=off["total_cost"],
                            min_hazard_dist=off["min_hazard_dist"], min_ttc_seen=float("nan"),
                            override_count=0, risk_score=0.0)
    evidence_log.log_trial(conn, seed=worst["seed"], shielded=True, scenario=knobs,
                            steps=on["steps"], total_cost=on["total_cost"],
                            min_hazard_dist=on["min_hazard_dist"], min_ttc_seen=on["min_ttc_seen"],
                            override_count=on["override_count"], risk_score=on["risk_score"])

    summary = (f"Seed {worst['seed']}, wind {knobs['wind_speed_10m']}km/h, "
               f"visibility {knobs['visibility']}m. Without shield: cost {off['total_cost']}, "
               f"min hazard dist {round(off['min_hazard_dist'],3)}m. With shield: cost "
               f"{on['total_cost']}, {on['override_count']} overrides, risk {on['risk_score']}/100.")
    print("\n[Phronesis] Compliance agent drafting report and escalating...\n")
    print(compliance_agent.escalate(summary))


if __name__ == "__main__":
    main()
