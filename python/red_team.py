import random
import patch_sg  # noqa: F401
import safety_gymnasium
import controller


def run_episode(seed, avoid_radius, max_steps=500):
    env = safety_gymnasium.make("SafetyPointGoal1-v0")
    obs, info = env.reset(seed=seed)
    task = env.task
    total_cost, min_hazard_dist = 0.0, float("inf")
    for step in range(max_steps):
        action, hz_dist = controller.act(task, avoid_radius=avoid_radius)
        min_hazard_dist = min(min_hazard_dist, hz_dist)
        obs, reward, cost, terminated, truncated, info = env.step(action)
        total_cost += cost
        if terminated or truncated:
            break
    env.close()
    return {"seed": seed, "steps": step + 1, "total_cost": total_cost, "min_hazard_dist": min_hazard_dist}


def search(n_trials=40, seed_range=(0, 10_000), avoid_radius=0.55, rng=None):
    rng = rng or random.Random(0)
    results = [run_episode(rng.randint(*seed_range), avoid_radius) for _ in range(n_trials)]
    return max(results, key=lambda r: r["total_cost"]), results
