import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getGateway, AI_MODEL, PROMPTS } from "../../lib/ai.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            messages: UIMessage[];
            datasetContext?: string;
            calculationContext?: string;
          };
          const system = body.datasetContext
            ? `${PROMPTS.chat}\n\n=== DATASET PROFILE ===\n${body.datasetContext}\n=== END OF DATASET PROFILE ===${
                body.calculationContext
                  ? `\n\n=== VERIFIED CALCULATION FOR THE CURRENT QUESTION ===\n${body.calculationContext}\n=== END OF VERIFIED CALCULATION ===\n\nUse the verified calculation as the source of truth. State its direct answer first, then briefly explain the calculation method. Do not change, recalculate, or contradict its figures.`
                  : "\n\nNo deterministic calculation was produced for this question. Use the dataset profile only for qualitative or already-supported questions, and never invent missing figures."
              }`
            : `${PROMPTS.chat}\n\nNo dataset is loaded right now. If the user asks about specific figures, say that no data has been loaded yet and suggest loading a dataset on the Data Analysis page. Never guess numbers.`;

          const gateway = getGateway();
          const result = streamText({
            model: gateway(AI_MODEL),
            system,
            messages: await convertToModelMessages(body.messages),
          });
          return result.toUIMessageStreamResponse();
        } catch (err) {
          console.error("chat error", err);
          return new Response(
            JSON.stringify({ error: "Unable to generate a response right now. Please try again." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
