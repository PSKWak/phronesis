"use client";

import { useEffect, useRef, useState } from "react";
import SimCanvas, { CanvasHazard, CanvasTrajPoint } from "@/components/SimCanvas";

interface EpisodeResult {
  seed: number;
  steps: number;
  totalCost: number;
  minHazardDist: number;
  reachedGoal: boolean;
  trajectory: CanvasTrajPoint[];
  overrideCount: number;
  minTtcSeen: number;
  riskScore: number;
}

interface ReproduceRecipe {
  rngSeed: number;
  nTrials: number;
  avoidRadius: number;
  margin: number;
  isReplay: boolean;
}

interface RunResponse {
  weather: { windSpeed10m: number; visibility: number; source: string };
  knobs: { avoidRadius: number; margin: number };
  redTeam: { trialsRun: number; violations: number; worstSeed: number };
  scenario: { hazards: CanvasHazard[]; goal: [number, number] };
  off: EpisodeResult;
  on: EpisodeResult;
  summary: string;
  compliance: { report: string; groqUsed: boolean; slackPosted: boolean; slackError?: string };
  reproduce: ReproduceRecipe;
}

interface HistoryEntry {
  ts: number;
  worstSeed: number;
  offCost: number;
  onCost: number;
  riskScore: number;
  recipe: ReproduceRecipe;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const maxFrame = result ? Math.max(result.off.trajectory.length, result.on.trajectory.length) - 1 : 0;

  useEffect(() => {
    if (!playing || !result) return;
    intervalRef.current = setInterval(() => {
      setFrame((f) => {
        if (f >= maxFrame) {
          setPlaying(false);
          return f;
        }
        return f + 4;
      });
    }, 30);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, result, maxFrame]);

  async function runCheck(replayOf?: ReproduceRecipe) {
    setLoading(true);
    setError(null);
    setPlaying(false);
    try {
      const body = replayOf
        ? {
            nTrials: replayOf.nTrials,
            rngSeed: replayOf.rngSeed,
            avoidRadius: replayOf.avoidRadius,
            margin: replayOf.margin,
          }
        : { nTrials: 40 };
      const resp = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data: RunResponse = await resp.json();
      setResult(data);
      setFrame(0);
      setPlaying(true);
      setHistory((h) => [
        {
          ts: Date.now(),
          worstSeed: data.redTeam.worstSeed,
          offCost: data.off.totalCost,
          onCost: data.on.totalCost,
          riskScore: data.on.riskScore,
          recipe: data.reproduce,
        },
        ...h,
      ].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-[#05070a] text-zinc-200">
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:px-10">
        <header className="mb-10">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-amber-400/80">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            Continuous assurance for physical AI
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Phronesis</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            A multi-agent layer that sits between a robot policy and the world: a{" "}
            <span className="text-zinc-200">Red-Team agent</span> adversarially searches for failure scenarios, a{" "}
            <span className="text-zinc-200">Physics-Grounded Shield</span> checks time-to-collision every step and
            overrides unsafe actions independent of the policy, and a{" "}
            <span className="text-zinc-200">Compliance agent</span> drafts a risk report and escalates it. Every run
            below grounds scenario difficulty in live weather, drafts its report with an LLM, and escalates to Slack —
            three real external services, called live.
          </p>
        </header>

        <div className="mb-8 flex flex-wrap items-center gap-4">
          <button
            onClick={() => runCheck()}
            disabled={loading}
            className="rounded-md bg-amber-500 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Running assurance check…" : "Run assurance check"}
          </button>
          {result && (
            <button
              onClick={() => runCheck(result.reproduce)}
              disabled={loading}
              className="rounded-md border border-white/15 px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              title={`Replays rngSeed=${result.reproduce.rngSeed}, nTrials=${result.reproduce.nTrials}, avoidRadius=${result.reproduce.avoidRadius.toFixed(3)}, margin=${result.reproduce.margin.toFixed(3)} — bit-identical Red-Team sampling and trajectories.`}
            >
              Reproduce this run
            </button>
          )}
          {result && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <PlaybackControls
                playing={playing}
                setPlaying={setPlaying}
                frame={frame}
                setFrame={setFrame}
                maxFrame={maxFrame}
              />
            </div>
          )}
          {error && <span className="text-sm text-red-400">Error: {error}</span>}
        </div>

        {result && (
          <>
            <div className="mb-8 grid gap-4 sm:grid-cols-3">
              <StatCard
                title="Weather grounding"
                sub={
                  result.weather.source === "open-meteo"
                    ? "live · Open-Meteo"
                    : result.weather.source === "replayed"
                      ? "replayed · not re-fetched"
                      : "fallback"
                }
              >
                {result.weather.source === "replayed" ? (
                  <div className="text-sm text-zinc-300">using recorded knobs from the original run</div>
                ) : (
                  <div className="text-sm text-zinc-300">
                    wind {result.weather.windSpeed10m.toFixed(1)} km/h · visibility{" "}
                    {(result.weather.visibility / 1000).toFixed(1)} km
                  </div>
                )}
                <div className="mt-1 text-xs text-zinc-500">
                  avoidRadius {result.knobs.avoidRadius.toFixed(3)} · margin {result.knobs.margin.toFixed(3)}
                </div>
              </StatCard>
              <StatCard title="Red-Team search" sub={`${result.redTeam.trialsRun} seeds scanned`}>
                <div className="text-sm text-zinc-300">
                  {result.redTeam.violations}/{result.redTeam.trialsRun} scenarios violated a hazard
                </div>
                <div className="mt-1 text-xs text-zinc-500">worst seed: {result.redTeam.worstSeed}</div>
                <div className="mt-1 font-mono text-[11px] text-zinc-600">rngSeed: {result.reproduce.rngSeed}</div>
              </StatCard>
              <StatCard title="Risk score (shield on)" sub="0–100, escalation trigger">
                <RiskGauge score={result.on.riskScore} />
              </StatCard>
            </div>

            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              <div>
                <SimCanvas
                  hazards={result.scenario.hazards}
                  goal={result.scenario.goal}
                  trajectory={result.off.trajectory}
                  frame={frame}
                  accentLabel="SHIELD OFF"
                  accentColor="#ef4444"
                />
                <MetricsRow ep={result.off} />
              </div>
              <div>
                <SimCanvas
                  hazards={result.scenario.hazards}
                  goal={result.scenario.goal}
                  trajectory={result.on.trajectory}
                  frame={frame}
                  accentLabel="SHIELD ON"
                  accentColor="#38bdf8"
                />
                <MetricsRow ep={result.on} />
              </div>
            </div>

            <div className="mb-8 rounded-lg border border-white/10 bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-zinc-200">Compliance report &amp; escalation</h2>
                <div className="flex gap-2">
                  <Badge ok={result.compliance.groqUsed} okLabel="Groq live" offLabel="Groq not configured" />
                  <Badge
                    ok={result.compliance.slackPosted}
                    okLabel="Posted to Slack"
                    offLabel="Slack not configured"
                  />
                </div>
              </div>
              <p className="text-sm leading-relaxed text-zinc-300">{result.compliance.report}</p>
              {result.compliance.slackError && (
                <p className="mt-2 text-xs text-red-400">Slack error: {result.compliance.slackError}</p>
              )}
            </div>

            {history.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
                <h2 className="mb-3 text-sm font-medium text-zinc-200">Evidence log (this session)</h2>
                <p className="mb-3 text-xs text-zinc-500">
                  Every row records the exact rngSeed and knobs used, so any past finding can be reproduced bit-for-bit.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-400">
                    <thead>
                      <tr className="border-b border-white/10 text-zinc-500">
                        <th className="py-1.5 pr-4">time</th>
                        <th className="py-1.5 pr-4">seed</th>
                        <th className="py-1.5 pr-4">cost off</th>
                        <th className="py-1.5 pr-4">cost on</th>
                        <th className="py-1.5 pr-4">risk</th>
                        <th className="py-1.5 pr-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.ts} className="border-b border-white/5">
                          <td className="py-1.5 pr-4">{new Date(h.ts).toLocaleTimeString()}</td>
                          <td className="py-1.5 pr-4">{h.worstSeed}</td>
                          <td className="py-1.5 pr-4">{h.offCost.toFixed(1)}</td>
                          <td className="py-1.5 pr-4">{h.onCost.toFixed(1)}</td>
                          <td className="py-1.5 pr-4">{h.riskScore.toFixed(1)}</td>
                          <td className="py-1.5 pr-4">
                            <button
                              onClick={() => runCheck(h.recipe)}
                              disabled={loading}
                              className="rounded border border-white/15 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                            >
                              Replay
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {!result && !loading && (
          <div className="rounded-lg border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">
            Click &ldquo;Run assurance check&rdquo; to have the Red-Team agent search for a failure scenario, compare
            the policy with the shield off vs on, and escalate a live report.
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 px-6 py-6 text-center text-xs text-zinc-500 sm:px-10">
        Phronesis — infrastructure for physical-AI trust &amp; safety validation, not a competitor to model-makers.
      </footer>
    </div>
  );
}

function PlaybackControls({
  playing,
  setPlaying,
  frame,
  setFrame,
  maxFrame,
}: {
  playing: boolean;
  setPlaying: (v: boolean) => void;
  frame: number;
  setFrame: (v: number) => void;
  maxFrame: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setPlaying(!playing)}
        className="rounded border border-white/15 px-3 py-1 text-xs text-zinc-300 hover:bg-white/5"
      >
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(1, maxFrame)}
        value={frame}
        onChange={(e) => {
          setPlaying(false);
          setFrame(Number(e.target.value));
        }}
        className="w-40"
      />
    </div>
  );
}

function StatCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mb-2 text-[11px] text-zinc-600">{sub}</div>
      {children}
    </div>
  );
}

function MetricsRow({ ep }: { ep: EpisodeResult }) {
  return (
    <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs text-zinc-400">
      <div>
        <div className="text-zinc-200">{ep.totalCost.toFixed(1)}</div>
        <div className="text-zinc-600">cost</div>
      </div>
      <div>
        <div className="text-zinc-200">{ep.minHazardDist.toFixed(3)}</div>
        <div className="text-zinc-600">min dist</div>
      </div>
      <div>
        <div className="text-zinc-200">{ep.overrideCount}</div>
        <div className="text-zinc-600">overrides</div>
      </div>
      <div>
        <div className="text-zinc-200">{ep.riskScore.toFixed(1)}</div>
        <div className="text-zinc-600">risk</div>
      </div>
    </div>
  );
}

function RiskGauge({ score }: { score: number }) {
  const color = score < 30 ? "#22c55e" : score < 65 ? "#f59e0b" : "#ef4444";
  return (
    <div>
      <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <div className="text-lg font-semibold" style={{ color }}>
        {score.toFixed(1)}
      </div>
    </div>
  );
}

function Badge({ ok, okLabel, offLabel }: { ok: boolean; okLabel: string; offLabel: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] ${
        ok ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/15 text-zinc-400"
      }`}
    >
      {ok ? okLabel : offLabel}
    </span>
  );
}
