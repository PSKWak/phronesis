// Deterministic seeded 2D point-robot simulation — a lightweight stand-in for the
// MuJoCo SafetyPointGoal1 environment, tuned to reproduce the same qualitative
// properties (momentum, reactive-only avoidance blind spot, discoverable hazard
// violations) so it can run inside a Vercel serverless function.

export type Vec2 = [number, number];

export interface Hazard {
  pos: Vec2;
  radius: number;
}

export interface Scenario {
  seed: number;
  hazards: Hazard[];
  goal: Vec2;
}

export interface AgentState {
  pos: Vec2;
  vel: Vec2;
  heading: number;
  angVel: number;
}

// mulberry32 — small, fast, deterministic PRNG seeded by a 32-bit integer.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARENA_RADIUS = 1.6;
const HAZARD_RADIUS = 0.2;
const N_HAZARDS = 8;
const MIN_SEP = 0.45; // hazards/goal must not spawn on top of each other or the origin

export function buildScenario(seed: number): Scenario {
  const rand = mulberry32(seed);
  const points: Vec2[] = [];

  const farEnough = (p: Vec2) => {
    if (Math.hypot(p[0], p[1]) < MIN_SEP) return false;
    for (const q of points) {
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < MIN_SEP) return false;
    }
    return true;
  };

  const sampleFree = (): Vec2 => {
    for (let tries = 0; tries < 200; tries++) {
      const ang = rand() * 2 * Math.PI;
      const r = Math.sqrt(rand()) * ARENA_RADIUS;
      const p: Vec2 = [r * Math.cos(ang), r * Math.sin(ang)];
      if (farEnough(p)) return p;
    }
    return [ARENA_RADIUS, 0];
  };

  const goal = sampleFree();
  points.push(goal);

  const hazards: Hazard[] = [];
  for (let i = 0; i < N_HAZARDS; i++) {
    const p = sampleFree();
    points.push(p);
    hazards.push({ pos: p, radius: HAZARD_RADIUS });
  }

  return { seed, hazards, goal };
}

export function initialState(): AgentState {
  return { pos: [0, 0], vel: [0, 0], heading: 0, angVel: 0 };
}

// Physical constants tuned so a naive reactive-only controller sometimes clips
// hazards (momentum carries it past the point it started avoiding).
export const DT = 0.02;
export const THRUST_GAIN = 6.0;
export const TURN_GAIN = 10.0;
export const LINEAR_DAMPING = 0.9; // fraction of velocity retained per second
export const ANGULAR_DAMPING = 0.8;

export function step(state: AgentState, action: Vec2): AgentState {
  const [forward, turn] = [clamp(action[0], -1, 1), clamp(action[1], -1, 1)];

  let angVel = state.angVel + turn * TURN_GAIN * DT;
  angVel *= Math.pow(ANGULAR_DAMPING, DT);
  const heading = state.heading + angVel * DT;

  const fx = Math.cos(state.heading) * forward * THRUST_GAIN;
  const fy = Math.sin(state.heading) * forward * THRUST_GAIN;

  let vx = state.vel[0] + fx * DT;
  let vy = state.vel[1] + fy * DT;
  const damp = Math.pow(LINEAR_DAMPING, DT);
  vx *= damp;
  vy *= damp;

  const px = state.pos[0] + vx * DT;
  const py = state.pos[1] + vy * DT;

  return { pos: [px, py], vel: [vx, vy], heading, angVel };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
