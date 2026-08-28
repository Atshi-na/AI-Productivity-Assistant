import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiJson, PROMPTS } from "./ai.server";

export type InsightStatus = "Stable" | "Needs Attention" | "High Priority";

export interface Insight {
  insight: string;
  /** "What the data shows" — plain-English supporting numbers. */
  evidence: string;
  /** "Why it matters" — plain-English business meaning. */
  impact: string;
  /** "Recommendation" — one practical next step. */
  recommendation?: string;
  status?: InsightStatus;
}

export interface Recommendation {
  finding: string;
  impact: string;
  recommendation: string;
  priority: "High" | "Medium" | "Low";
  nextStep: string;
}

export interface MeetingSummary {
  executiveSummary: string;
  keyDiscussionPoints: string[];
  decisionsMade: string[];
  actionItems: Array<{ task: string; owner: string; deadline: string }>;
  businessImplications: string[];
  recommendedNextSteps: string[];
}

export const generateInsightsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ summaryText: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    return aiJson<Insight[]>(
      PROMPTS.insights.system,
      `Dataset summary (facts computed from the data):\n${data.summaryText}`,
    );
  });

export const generateRecommendationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        summaryText: z.string().min(1),
        insights: z.array(z.object({ insight: z.string(), evidence: z.string(), impact: z.string() })),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const insightText = data.insights.map((i, n) => `${n + 1}. ${i.insight} (evidence: ${i.evidence})`).join("\n");
    return aiJson<Recommendation[]>(
      PROMPTS.recommendations.system,
      `Dataset facts:\n${data.summaryText}\n\nGenerated insights:\n${insightText || "None yet — base recommendations on the dataset facts only."}`,
    );
  });

export const generateEmailFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        purpose: z.string().min(1),
        audience: z.string().min(1),
        context: z.string().min(1),
        keyPoints: z.string(),
        tone: z.enum(["Formal", "Friendly", "Persuasive"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return aiJson<{ subject: string; body: string }>(
      PROMPTS.email.system,
      `Role: business analyst writing to ${data.audience}.
Objective: ${data.purpose}.
Context and findings: ${data.context}.
Key information to include: ${data.keyPoints || "None specified."}.
Tone: ${data.tone}.
Constraints: professional, concise, ready to send.`,
    );
  });

export const summarizeMeetingFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        notes: z.string().min(1),
        title: z.string(),
        date: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return aiJson<MeetingSummary>(
      PROMPTS.meeting.system,
      `Meeting title: ${data.title || "Untitled meeting"}\nMeeting date: ${data.date || "Not specified"}\n\nMeeting notes:\n${data.notes}`,
    );
  });
