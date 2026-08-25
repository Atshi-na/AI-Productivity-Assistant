import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui-bits";

export const Route = createFileRoute("/responsible-ai")({
  head: () => ({
    meta: [
      { title: "Responsible AI — Meridian AI" },
      {
        name: "description",
        content: "How this application uses AI responsibly: grounding, transparency, and human validation.",
      },
      { property: "og:title", content: "Responsible AI — Meridian AI" },
      {
        property: "og:description",
        content: "How this application uses AI responsibly: grounding, transparency, and human validation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResponsibleAiPage,
});

const PRINCIPLES = [
  {
    title: "Grounded in data",
    body: "Insights and recommendations are generated from factual summaries computed directly from the uploaded dataset. The AI is instructed to make numerical claims only when they are supported by the supplied data.",
  },
  {
    title: "No fabrication",
    body: "The meeting summarizer states \"Not specified in the notes\" when decisions, owners, or deadlines are missing. The AI never invents people, dates, or decisions.",
  },
  {
    title: "Facts vs. interpretation",
    body: "Structured prompts require the AI to separate factual observations (what happened, with evidence) from interpretations (why it may matter).",
  },
  {
    title: "Human validation",
    body: "Every AI surface reminds users that outputs are decision-support tools. Important figures should always be validated against the underlying data before making business decisions.",
  },
  {
    title: "Transparency about limits",
    body: "When information is insufficient, the AI says so explicitly rather than filling gaps with plausible-sounding but unsupported statements.",
  },
];

function ResponsibleAiPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Responsible AI" description="How this application uses AI to support — not replace — professional judgment." />

      <Panel>
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Our commitment</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Responsible AI: AI-generated insights, recommendations, summaries, and communications may contain
              errors or misinterpretations. Always validate important information against the underlying data and
              reliable sources before making business decisions.
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              AI outputs are decision-support tools and should not replace professional judgment.
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="panel p-5">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <h3 className="text-sm font-semibold text-foreground">{p.title}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
