// The policy under test: a PD controller on distance-to-goal with a *reactive-only*
// hazard-avoidance behavior — it does nothing until a hazard is already inside
// avoidRadius. That reactive-only lag is the deliberate blind spot the Red-Team
// agent exists to find, and that the Shield exists to catch independent of this
// policy's own logic.
import { AgentState, Hazard, Vec2, clamp, dist } from "./physics";

export function nearestHazard(pos: Vec2, hazards: Hazard[]): { hazard: Hazard; dist: number } {
  let best = hazards[0];
  let bestDist = dist(pos, best.pos);
  for (const h of hazards.slice(1)) {
    const d = dist(pos, h.pos);
    if (d < bestDist) {
      best = h;
      bestDist = d;
    }
  }
  return { hazard: best, dist: bestDist };
}

export function act(
  state: AgentState,
  goal: Vec2,
  hazards: Hazard[],
  avoidRadius = 0.55,
  avoidGain = 2.5
): { action: Vec2; hazardDist: number } {
  const hdg = state.heading;
  const fwdDir: Vec2 = [Math.cos(hdg), Math.sin(hdg)];
  const fwdSpeed = state.vel[0] * fwdDir[0] + state.vel[1] * fwdDir[1];

  const goalVec: Vec2 = [goal[0] - state.pos[0], goal[1] - state.pos[1]];
  const distGoal = Math.hypot(goalVec[0], goalVec[1]);
  const goalAng = Math.atan2(goalVec[1], goalVec[0]);

  const { hazard, dist: hazardDist } = nearestHazard(state.pos, hazards);

  let forward: number;
  let turn: number;

  if (hazardDist < avoidRadius) {
    const awayVec: Vec2 = [state.pos[0] - hazard.pos[0], state.pos[1] - hazard.pos[1]];
    const awayAng = Math.atan2(awayVec[1], awayVec[0]);
    const angErr = Math.atan2(Math.sin(awayAng - hdg), Math.cos(awayAng - hdg));
    turn = clamp(avoidGain * angErr, -1, 1);
    forward = 0.35;
  } else {
    const angErr = Math.atan2(Math.sin(goalAng - hdg), Math.cos(goalAng - hdg));
    turn = clamp(1.5 * angErr, -1, 1);
    const targetSpeed = clamp(1.4 * distGoal, 0, 1) * clamp(1 - Math.abs(angErr), 0, 1);
    forward = clamp(1.6 * (targetSpeed - fwdSpeed), -1, 1);
  }

  return { action: [forward, turn], hazardDist };
}
