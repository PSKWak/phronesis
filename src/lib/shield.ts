// Physics-Grounded Shield: checks time-to-collision every step and overrides
// unsafe actions independent of the policy under test. Steers away rather than
// just braking — a brake-only override leaves a momentum-carrying robot drifting
// across the hazard boundary, re-triggering the override every step.
import { AgentState, Hazard, Vec2, clamp } from "./physics";

export function timeToCollision(state: AgentState, hazard: Hazard, margin = 0.12): number {
  const relPos: Vec2 = [hazard.pos[0] - state.pos[0], hazard.pos[1] - state.pos[1]];
  const d = Math.hypot(relPos[0], relPos[1]);
  const closingSpeed = d > 1e-6 ? (relPos[0] * state.vel[0] + relPos[1] * state.vel[1]) / d : 0;
  const gap = d - hazard.radius - margin;
  if (closingSpeed <= 1e-6 || gap <= 0) return gap <= 0 ? 0 : Infinity;
  return gap / closingSpeed;
}

export function riskScore(minTtc: number, costSoFar: number, overrideCount: number, steps: number): number {
  const ttcTerm = Number.isFinite(minTtc) ? 60 * Math.exp(-Math.max(minTtc, 0) / 0.6) : 0;
  const costTerm = Math.min(30, costSoFar * 0.6);
  const overrideTerm = Math.min(10, (overrideCount / Math.max(steps, 1)) * 100);
  return Math.round(Math.min(100, ttcTerm + costTerm + overrideTerm) * 10) / 10;
}

export class Shield {
  ttcThreshold: number;
  margin: number;
  avoidGain: number;
  avoidForward: number;
  minTtcSeen = Infinity;
  overrideCount = 0;

  constructor(ttcThreshold = 0.45, margin = 0.1, avoidGain = 3.5, avoidForward = 0.6) {
    this.ttcThreshold = ttcThreshold;
    this.margin = margin;
    this.avoidGain = avoidGain;
    this.avoidForward = avoidForward;
  }

  check(state: AgentState, hazards: Hazard[], proposedAction: Vec2): { action: Vec2; overridden: boolean; minTtc: number } {
    let nearestHz = hazards[0];
    let minTtc = this.timeToCollisionFor(state, nearestHz);
    for (const h of hazards.slice(1)) {
      const t = this.timeToCollisionFor(state, h);
      if (t < minTtc) {
        minTtc = t;
        nearestHz = h;
      }
    }
    this.minTtcSeen = Math.min(this.minTtcSeen, minTtc);

    if (minTtc < this.ttcThreshold) {
      this.overrideCount += 1;
      const hdg = state.heading;
      const awayVec: Vec2 = [state.pos[0] - nearestHz.pos[0], state.pos[1] - nearestHz.pos[1]];
      const awayAng = Math.atan2(awayVec[1], awayVec[0]);
      const angErr = Math.atan2(Math.sin(awayAng - hdg), Math.cos(awayAng - hdg));
      const turn = clamp(this.avoidGain * angErr, -1, 1);
      return { action: [this.avoidForward, turn], overridden: true, minTtc };
    }
    return { action: proposedAction, overridden: false, minTtc };
  }

  private timeToCollisionFor(state: AgentState, hazard: Hazard) {
    return timeToCollision(state, hazard, this.margin);
  }
}
