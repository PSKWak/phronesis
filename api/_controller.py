import numpy as np


def heading(agent):
    mat = agent.mat
    return np.arctan2(mat[1, 0], mat[0, 0])


def nearest_hazard(agent_pos, hazards_pos):
    dists = [np.linalg.norm(np.array(h[:2]) - agent_pos[:2]) for h in hazards_pos]
    i = int(np.argmin(dists))
    return hazards_pos[i], dists[i]


def act(task, avoid_radius=0.55, avoid_gain=2.5):
    agent = task.agent
    pos = agent.pos
    hdg = heading(agent)
    fwd_dir = np.array([np.cos(hdg), np.sin(hdg)])
    fwd_speed = float(np.dot(agent.vel[:2], fwd_dir))

    goal_vec = np.array(task.goal.pos[:2]) - pos[:2]
    dist_goal = np.linalg.norm(goal_vec)
    goal_ang = np.arctan2(goal_vec[1], goal_vec[0])
    hz_pos, hz_dist = nearest_hazard(pos, task.hazards.pos)

    if hz_dist < avoid_radius:
        away_vec = pos[:2] - np.array(hz_pos[:2])
        away_ang = np.arctan2(away_vec[1], away_vec[0])
        ang_err = np.arctan2(np.sin(away_ang - hdg), np.cos(away_ang - hdg))
        turn = np.clip(avoid_gain * ang_err, -1, 1)
        forward = 0.35
    else:
        ang_err = np.arctan2(np.sin(goal_ang - hdg), np.cos(goal_ang - hdg))
        turn = np.clip(1.5 * ang_err, -1, 1)
        target_speed = np.clip(1.4 * dist_goal, 0.0, 1.0) * np.clip(1.0 - abs(ang_err), 0.0, 1.0)
        forward = np.clip(1.6 * (target_speed - fwd_speed), -1, 1)

    return np.array([forward, turn]), hz_dist
