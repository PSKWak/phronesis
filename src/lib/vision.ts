// Vision agent: grounds scenario difficulty in an actual photo of a real space,
// the same way weather.ts grounds it in live conditions. Reuses GROQ_API_KEY —
// no new external service to configure.
const GROQ_VISION_MODEL = "qwen/qwen3.6-27b"; // Groq's vision-capable model as of this
                                                // build — check console.groq.com/docs/vision
                                                // if this drifts

export interface VisionResult {
  used: boolean;
  hazardDensity: number; // 0-1: how cluttered/hazardous the scene looks for a small mobile robot
  description: string;
}

const DEFAULT_VISION: VisionResult = { used: false, hazardDensity: 0, description: "" };

export async function analyzeImage(imageDataUrl: string): Promise<VisionResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log("[vision] GROQ_API_KEY not set — skipping image analysis.");
    return DEFAULT_VISION;
  }
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "You are grounding a robot-safety test scenario in a real photo. Look at this " +
                  "image of a physical space and estimate how hazardous or cluttered it would be " +
                  "for a small mobile robot to navigate. Respond with EXACTLY one line of strict " +
                  'JSON and nothing else: {"hazard_density": <number 0 to 1>, "description": ' +
                  '"<one short sentence>"}',
              },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) throw new Error(`Groq vision returned ${resp.status}`);
    const data = await resp.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON found in vision response");
    const parsed = JSON.parse(match[0]);
    const hazardDensity = Math.min(1, Math.max(0, Number(parsed.hazard_density) || 0));
    const description = String(parsed.description || "").slice(0, 200);
    return { used: true, hazardDensity, description };
  } catch (exc) {
    console.error("[vision] image analysis failed; ignoring image for this run.", exc);
    return DEFAULT_VISION;
  }
}
