# Phronesis — web demo

Live: https://phronesis-khaki.vercel.app

A continuous-assurance layer for physical AI: a Red-Team agent adversarially
searches seeded scenarios for policy failures, a Physics-Grounded Shield
overrides unsafe actions in real time independent of the policy, and a
Compliance agent drafts a risk report and escalates it. This is a from-scratch
TypeScript reimplementation of the point-robot simulation from the original
Python/MuJoCo prototype (see `../` for that), rebuilt so the whole pipeline
runs inside a Vercel serverless function.

## Architecture

One route, `src/app/api/run/route.ts`, orchestrates three stages sequentially
(each stage's output feeds the next, so there's nothing to parallelize):

1. **Weather** (`src/lib/weather.ts`) — live call to the Open-Meteo API (no
   key required) grounds scenario difficulty (`avoidRadius`, `margin`) in
   real wind/visibility conditions.
2. **Red-Team** (`src/lib/redTeam.ts`) — samples `nTrials` seeds, runs each
   through the deterministic physics engine (`src/lib/physics.ts`,
   `src/lib/controller.ts`), and returns the worst (highest-cost) scenario.
3. **Shield** (`src/lib/shield.ts`) — a time-to-collision override wrapped
   around every step of the episode (`src/lib/simulate.ts`), run once with
   the shield off and once on, for direct comparison.
4. **Compliance** (`src/lib/compliance.ts`) — drafts a plain-English report
   via Groq and posts it to Slack.

Groq and Slack degrade gracefully to a raw-text report / a server-side log
line when their API keys aren't configured — the pipeline never crashes for
missing credentials.

## Reproducibility

Every simulated run is a pure function of four numbers:
`(rngSeed, nTrials, avoidRadius, margin)`. A fresh run mints a new `rngSeed`
and pulls live weather to derive the knobs; the response's `reproduce` field
echoes back the exact recipe used. POSTing that recipe back to `/api/run`
(the "Reproduce this run" button, or "Replay" on any evidence-log row) skips
the weather call and reproduces the identical worst-case seed, trajectories,
costs, and override counts — bit-for-bit. This matters because an
evidence-log entry that can't be replayed isn't useful as evidence.

The only non-deterministic piece by nature is the Groq-drafted report text
(LLM sampling) — `temperature: 0` is set to minimize that, but wording may
still drift slightly between runs of the same summary; the underlying
simulation facts it's drafted from are always identical on replay.

`package-lock.json` pins exact dependency versions for reproducible installs.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without any environment variables set, weather
grounding is live (no key needed) and Groq/Slack fall back to logging what
they would have sent.

## Environment variables

Set these in the Vercel project's **Settings → Environment Variables**
(Production scope) to enable the other two external integrations:

| Variable            | Purpose                                   | Get one at |
|---------------------|--------------------------------------------|------------|
| `GROQ_API_KEY`      | LLM-drafted compliance report              | console.groq.com |
| `SLACK_WEBHOOK_URL` | Escalation post to a Slack channel         | api.slack.com/apps → Incoming Webhooks |

Redeploy after adding them (`vercel deploy --prod`) so the running functions
pick up the new values.

## Deploy

```bash
vercel deploy --prod
```
