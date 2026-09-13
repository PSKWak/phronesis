// Compliance/Escalation agent: drafts a plain-English risk report via Groq and
// escalates it to Slack. Both are optional at runtime — missing keys degrade to
// a raw summary and a logged (not sent) message, never a crash.
const GROQ_MODEL = "openai/gpt-oss-20b";

export interface EscalationResult {
  report: string;
  groqUsed: boolean;
  slackPosted: boolean;
  slackError?: string;
}

export async function draftReport(runSummary: string): Promise<{ report: string; groqUsed: boolean }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { report: runSummary, groqUsed: false };
  }
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0, // maximize reproducibility of the drafted wording for a given summary
        messages: [
          {
            role: "user",
            content: `Write a 3-sentence plain-English safety report for this robot test run: ${runSummary}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`Groq returned ${resp.status}`);
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content ?? runSummary;
    return { report: text, groqUsed: true };
  } catch (exc) {
    console.error("[compliance] Groq call failed; using raw summary.", exc);
    return { report: runSummary, groqUsed: false };
  }
}

export async function postToSlack(text: string): Promise<{ posted: boolean; error?: string }> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log(`[compliance] SLACK_WEBHOOK_URL not set — would have posted:\n${text}`);
    return { posted: false };
  }
  try {
    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:shield: Phronesis Safety Report\n${text}` }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`Slack webhook returned ${resp.status}`);
    return { posted: true };
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    console.error("[compliance] Slack post failed.", exc);
    return { posted: false, error: message };
  }
}

export async function escalate(runSummary: string): Promise<EscalationResult> {
  const { report, groqUsed } = await draftReport(runSummary);
  const { posted, error } = await postToSlack(report);
  return { report, groqUsed, slackPosted: posted, slackError: error };
}
