import numpy as np


def time_to_collision(agent_pos, agent_vel, hazard_pos, hazard_radius, margin=0.12):
    """Seconds until the agent's edge reaches the hazard's margin boundary,
    assuming current velocity holds. +inf if not currently closing on it."""
    rel_pos = np.array(hazard_pos[:2]) - np.array(agent_pos[:2])
    dist = np.linalg.norm(rel_pos)
    closing_speed = float(np.dot(rel_pos, agent_vel[:2]) / dist) if dist > 1e-6 else 0.0
    gap = dist - hazard_radius - margin
    if closing_speed <= 1e-6 or gap <= 0:
        return 0.0 if gap <= 0 else float("inf")
    return gap / closing_speed


def risk_score(min_ttc, cost_so_far, override_count, steps):
    ttc_term = 60.0 * np.exp(-max(min_ttc, 0.0) / 0.6) if np.isfinite(min_ttc) else 0.0
    cost_term = min(30.0, cost_so_far * 0.6)
    override_term = min(10.0, (override_count / max(steps, 1)) * 100)
    return round(min(100.0, ttc_term + cost_term + override_term), 1)


class Shield:
    def __init__(self, ttc_threshold=0.45, margin=0.12, avoid_gain=3.0, avoid_forward=0.5):
        self.ttc_threshold, self.margin = ttc_threshold, margin
        self.avoid_gain, self.avoid_forward = avoid_gain, avoid_forward
        self.min_ttc_seen, self.override_count = float("inf"), 0

    def check(self, task, proposed_action):
        agent = task.agent
        pos, vel = agent.pos, agent.vel
        radius = task.hazards.size
        hz_ttcs = [(hz, time_to_collision(pos, vel, hz, radius, self.margin)) for hz in task.hazards.pos]
        nearest_hz, min_ttc = min(hz_ttcs, key=lambda x: x[1]) if hz_ttcs else (None, float("inf"))
        self.min_ttc_seen = min(self.min_ttc_seen, min_ttc)

        if min_ttc < self.ttc_threshold:
            self.override_count += 1
            hdg = np.arctan2(agent.mat[1, 0], agent.mat[0, 0])
            away_vec = pos[:2] - np.array(nearest_hz[:2])
            away_ang = np.arctan2(away_vec[1], away_vec[0])
            ang_err = np.arctan2(np.sin(away_ang - hdg), np.cos(away_ang - hdg))
            turn = np.clip(self.avoid_gain * ang_err, -1, 1)
            return np.array([self.avoid_forward, turn]), True, min_ttc
        return proposed_action, False, min_ttc
