import Anthropic from "@anthropic-ai/sdk";

export type Classification = {
  category:
    | "service_speed"
    | "drink_quality"
    | "staff_attitude"
    | "wait_time"
    | "food"
    | "noise"
    | "other";
  confidence: "low" | "medium" | "high";
  suggestion: string;
  serverName: string | null;
};

const SYSTEM_PROMPT = `You are a service-recovery assistant for US bars and restaurants.
A guest left a 1–3 star rating with an optional free-text note.
Classify the most likely issue, give a confidence level, and propose a concrete owner action under 25 words.
If the note names a specific staff member, extract that name (first name only, or full if given).

Return strict JSON matching this schema and nothing else:
{
  "category": "service_speed" | "drink_quality" | "staff_attitude" | "wait_time" | "food" | "noise" | "other",
  "confidence": "low" | "medium" | "high",
  "suggestion": "string under 25 words",
  "serverName": "string or null"
}

Rules:
- Be concise and actionable. Suggestions should start with a verb.
- Never recommend firing or disciplinary action — only training, conversation, or comp.
- If the note is empty or uninformative, category=other, confidence=low, suggestion="Reach out to the guest directly to learn more.", serverName=null.`;

const FEW_SHOTS = [
  {
    role: "user" as const,
    content: 'Rating: 2 stars\nNote: "Waited 8 min for second drink, server seemed annoyed when I asked again."',
  },
  {
    role: "assistant" as const,
    content:
      '{"category":"service_speed","confidence":"high","suggestion":"Comp the next round and have a one-on-one with the server about pacing.","serverName":null}',
  },
];

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function classifyFeedback(input: { rating: number; note: string | null }): Promise<Classification> {
  const noteText = (input.note ?? "").trim();
  const userMessage = `Rating: ${input.rating} stars\nNote: ${noteText ? `"${noteText}"` : "(none)"}`;

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const resp = await getClient().messages.create({
    model,
    max_tokens: 220,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" }, // cache the long instruction block
      },
    ],
    messages: [
      ...FEW_SHOTS,
      { role: "user", content: userMessage },
    ],
  });

  const block = resp.content[0];
  const text = block && block.type === "text" ? block.text : "";

  const parsed = extractJson(text);
  if (!parsed) {
    // Defensive fallback: never throw on a misformatted classifier response.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[classify-feedback] could not parse model output:", text.slice(0, 400));
    }
    return {
      category: "other",
      confidence: "low",
      suggestion: "Reach out to the guest directly to learn more.",
      serverName: null,
    };
  }
  return parsed as Classification;
}

/**
 * Tolerate markdown fences and incidental prose around the JSON object.
 * The model is instructed to return strict JSON, but Haiku occasionally
 * prefixes ```json or adds a trailing newline + comment.
 */
function extractJson(text: string): unknown | null {
  if (!text) return null;
  const trimmed = text.trim();
  // direct parse
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  // fenced ```json ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
  }
  // first balanced { ... } chunk
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}
