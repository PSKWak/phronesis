import { NextResponse } from "next/server";
import { getWeather, weatherToKnobs } from "@/lib/weather";
import { search } from "@/lib/redTeam";
import { runEpisode, scenarioFor } from "@/lib/simulate";
import { escalate } from "@/lib/compliance";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const nTrials: number = Math.min(200, Math.max(5, Number(body?.nTrials) || 40));
  const lat: number = typeof body?.lat === "number" ? body.lat : 40.7128;
  const lon: number = typeof body?.lon === "number" ? body.lon : -74.006;

  // Reproducibility contract: every random draw in this pipeline is a pure
  // function of (rngSeed, nTrials, avoidRadius, margin). A fresh run mints a
  // new rngSeed and pulls live weather; a replay supplies all four explicitly
  // (skipping the weather call, since conditions may have since changed) and
  // is guaranteed to reproduce the exact same worst-case seed and trajectories.
  const isReplay = typeof body?.rngSeed === "number" && typeof body?.avoidRadius === "number" && typeof body?.margin === "number";

  const rngSeed: number = isReplay ? body.rngSeed : Math.floor(Math.random() * 1_000_000);

  let knobs: { windSpeed10m: number; visibility: number; avoidRadius: number; margin: number; source: string };
  if (isReplay) {
    knobs = {
      windSpeed10m: NaN,
      visibility: NaN,
      avoidRadius: body.avoidRadius,
      margin: body.margin,
      source: "replayed",
    };
  } else {
    const { wind, visibility, source } = await getWeather(lat, lon);
    knobs = weatherToKnobs(wind, visibility, source);
  }

  const redTeamReport = search(nTrials, knobs.avoidRadius, rngSeed);
  const worstSeed = redTeamReport.worst.seed;

  const off = runEpisode(worstSeed, knobs.avoidRadius, false, knobs.margin, true);
  const on = runEpisode(worstSeed, knobs.avoidRadius, true, knobs.margin, true);
  const scenario = scenarioFor(worstSeed);

  const conditionsPhrase = isReplay
    ? "replayed conditions (weather not re-fetched)"
    : `wind ${knobs.windSpeed10m.toFixed(1)}km/h, visibility ${knobs.visibility.toFixed(0)}m (${knobs.source})`;

  const summary =
    `Seed ${worstSeed}, ${conditionsPhrase}. Red-Team found ${redTeamReport.violations}/${redTeamReport.trialsRun} ` +
    `scenarios with hazard violations. Without shield: cost ${off.totalCost.toFixed(1)}, min hazard dist ${off.minHazardDist.toFixed(3)}m. ` +
    `With shield: cost ${on.totalCost.toFixed(1)}, ${on.overrideCount} overrides, risk ${on.riskScore.toFixed(1)}/100.`;

  const compliance = await escalate(summary);

  return NextResponse.json({
    weather: { windSpeed10m: knobs.windSpeed10m, visibility: knobs.visibility, source: knobs.source },
    knobs: { avoidRadius: knobs.avoidRadius, margin: knobs.margin },
    redTeam: {
      trialsRun: redTeamReport.trialsRun,
      violations: redTeamReport.violations,
      worstSeed,
    },
    // Everything needed to reproduce this exact run bit-for-bit: replay by
    // POSTing { rngSeed, nTrials, avoidRadius: knobs.avoidRadius, margin: knobs.margin }.
    reproduce: { rngSeed, nTrials, avoidRadius: knobs.avoidRadius, margin: knobs.margin, isReplay },
    scenario,
    off,
    on,
    summary,
    compliance,
  });
}
