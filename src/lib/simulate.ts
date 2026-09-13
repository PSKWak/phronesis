import { AgentState, Hazard, Vec2, buildScenario, dist, initialState, step } from "./physics";
import { act } from "./controller";
import { Shield, riskScore } from "./shield";

export interface TrajectoryPoint {
  pos: Vec2;
  heading: number;
  overridden: boolean;
}

export interface EpisodeResult {
  seed: number;
  steps: number;
  totalCost: number;
  minHazardDist: number;
  reachedGoal: boolean;
  trajectory: TrajectoryPoint[];
  overrideCount: number;
  minTtcSeen: number;
  riskScore: number;
}

const MAX_STEPS = 500;
const GOAL_TOLERANCE = 0.3;
const COST_PER_STEP_IN_HAZARD = 1;

export function runEpisode(
  seed: number,
  avoidRadius: number,
  useShield: boolean,
  shieldMargin: number,
  recordTrajectory = false
): EpisodeResult {
  const scenario = buildScenario(seed);
  let state: AgentState = initialState();
  const shield = useShield ? new Shield(0.45, shieldMargin, 3.5, 0.6) : null;

  let totalCost = 0;
  let minHazardDist = Infinity;
  let reachedGoal = false;
  const trajectory: TrajectoryPoint[] = [];
  let lastStep = MAX_STEPS;

  for (let i = 0; i < MAX_STEPS; i++) {
    const { action: policyAction, hazardDist } = act(state, scenario.goal, scenario.hazards, avoidRadius);
    minHazardDist = Math.min(minHazardDist, hazardDist);

    let action: Vec2 = policyAction;
    let overridden = false;
    if (shield) {
      const result = shield.check(state, scenario.hazards, policyAction);
      action = result.action;
      overridden = result.overridden;
    }

    if (recordTrajectory) trajectory.push({ pos: [state.pos[0], state.pos[1]], heading: state.heading, overridden });

    state = step(state, action);

    for (const h of scenario.hazards) {
      if (dist(state.pos, h.pos) < h.radius) {
        totalCost += COST_PER_STEP_IN_HAZARD;
      }
    }

    if (dist(state.pos, scenario.goal) < GOAL_TOLERANCE) {
      reachedGoal = true;
      lastStep = i + 1;
      break;
    }
    lastStep = i + 1;
  }
  if (recordTrajectory) trajectory.push({ pos: [state.pos[0], state.pos[1]], heading: state.heading, overridden: false });

  return {
    seed,
    steps: lastStep,
    totalCost,
    minHazardDist,
    reachedGoal,
    trajectory,
    overrideCount: shield?.overrideCount ?? 0,
    minTtcSeen: shield?.minTtcSeen ?? NaN,
    riskScore: shield ? riskScore(shield.minTtcSeen, totalCost, shield.overrideCount, lastStep) : 0,
  };
}

export interface HazardExport {
  pos: Vec2;
  radius: number;
}

export function scenarioFor(seed: number): { hazards: HazardExport[]; goal: Vec2 } {
  const s = buildScenario(seed);
  return { hazards: s.hazards, goal: s.goal };
}
