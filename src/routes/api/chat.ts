import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getGateway, AI_MODEL, PROMPTS } from "../../lib/ai.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { messages: UIMessage[]; datasetContext?: string };
          const system = body.datasetContext
            ? `${PROMPTS.chat}\n\nThe user has loaded a dataset. Factual summary computed from the data:\n${body.datasetContext}\n\nGround every numerical claim about the dataset in these facts.`
            : `${PROMPTS.chat}\n\nNo dataset is currently loaded. If the user asks about specific figures, note that no dataset has been uploaded yet and suggest loading one on the Data Analysis page.`;

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
