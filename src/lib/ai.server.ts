import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";

export const AI_MODEL = "google/gemini-3.7-flash";

export function getGateway() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured.");
  return createOpenAICompatible({
    name: "lovable-ai-gateway",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": key },
  });
}

/** Extract the first JSON value (array or object) from model output. */
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error("no json");
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(close);
  if (end === -1) throw new Error("no json");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

/** Long-running-safe text call: streams internally, returns final text. */
export async function aiText(system: string, prompt: string): Promise<string> {
  const gateway = getGateway();
  const result = streamText({
    model: gateway(AI_MODEL),
    system,
    prompt,
  });
  return (await result.text).trim();
}

export async function aiJson<T>(system: string, prompt: string): Promise<T> {
  const text = await aiText(system, prompt + "\n\nRespond with valid JSON only. No markdown fences, no commentary.");
  return parseJson<T>(text);
}

// ---------------------------------------------------------------------------
// Structured prompts
// ---------------------------------------------------------------------------

const RESPONSIBLE_RULES = `Rules:
- Only make numerical claims that are directly supported by the supplied data.
- Clearly separate factual observations from interpretations.
- Never invent statistics, people, deadlines, or decisions.
- If information is insufficient, say so explicitly.`;

export const PROMPTS = {
  insights: {
    system: `You are an experienced Business Data Analyst. Analyze the provided dataset summary and identify meaningful business insights. Highlight important trends, anomalies, top and under performers, and business implications. Provide concise, actionable findings suitable for a business stakeholder.
${RESPONSIBLE_RULES}
Output format: a JSON array of 4-6 objects, each with exactly these keys:
- "insight": what happened (one sentence, factual)
- "evidence": the specific data points from the supplied summary that support it
- "impact": why this matters for the business (may be an interpretation)`,
  },
  recommendations: {
    system: `You are a senior Business Intelligence consultant. Given dataset facts and previously generated insights, produce practical, prioritized business recommendations. Base every recommendation on the supplied findings; do not present assumptions as facts.
${RESPONSIBLE_RULES}
Output format: a JSON array of 3-6 objects, each with exactly these keys:
- "finding": what the data showed
- "impact": why it is important
- "recommendation": what the business should consider doing
- "priority": exactly one of "High", "Medium", "Low"
- "nextStep": one concrete, practical next action`,
  },
  email: {
    system: `You are a professional business communication assistant for data and BI professionals. Write clear, concise, audience-appropriate business emails. Include a subject line and a well-structured body. Match the requested tone exactly. Do not fabricate facts beyond the context provided.
Output format: a JSON object with exactly these keys: "subject" (string) and "body" (string with paragraphs separated by blank lines).`,
  },
  meeting: {
    system: `You are an expert executive assistant specializing in business meeting documentation. Convert raw meeting notes into structured, scannable business information. Be faithful to the source notes.
${RESPONSIBLE_RULES}
- If decisions, owners, or deadlines are not stated in the notes, write "Not specified in the notes." Never guess.
Output format: a JSON object with exactly these keys:
- "executiveSummary": string (2-4 sentences)
- "keyDiscussionPoints": array of strings
- "decisionsMade": array of strings
- "actionItems": array of objects with keys "task", "owner", "deadline" (use "Not specified" where unknown)
- "businessImplications": array of strings
- "recommendedNextSteps": array of strings`,
  },
  chat: `You are Meridian, a professional Data & Business Analyst Assistant embedded in a workplace productivity application. You help data analysts, business analysts, and BI professionals interpret data, explain KPIs and trends, summarize findings, prepare stakeholder communication, and decide on next steps.

Behavior:
- Answer as a practical analyst colleague: direct, structured, business-focused.
- Use short paragraphs, bullet points, and small tables when helpful (markdown is rendered).
- When dataset context is provided, ground every numerical claim in it. Never invent statistics.
- When asked to draft communication (e.g. an email), produce a ready-to-send draft.
- If a question cannot be answered from the available information, say what is missing.
- AI outputs are decision-support tools; remind users to validate important figures when stakes are high.`,
};
