// Red-Team agent: since hazard/goal layout is randomized per seed, the seed is
// the natural adversarial-search parameter — no scenario config API to fight.
import { EpisodeResult, runEpisode } from "./simulate";

export interface RedTeamReport {
  worst: EpisodeResult;
  trialsRun: number;
  violations: number;
  sampledSeeds: number[];
}

// Small deterministic PRNG so a given run is reproducible if seeded explicitly.
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

export function search(nTrials: number, avoidRadius: number, rngSeed = Date.now() % 100000): RedTeamReport {
  const rand = mulberry32(rngSeed);
  let worst: EpisodeResult | null = null;
  let violations = 0;
  const sampledSeeds: number[] = [];

  for (let i = 0; i < nTrials; i++) {
    const seed = Math.floor(rand() * 100000);
    sampledSeeds.push(seed);
    const result = runEpisode(seed, avoidRadius, false, 0.1);
    if (result.totalCost > 0) violations++;
    if (!worst || result.totalCost > worst.totalCost) worst = result;
  }

  return { worst: worst!, trialsRun: nTrials, violations, sampledSeeds };
}
