import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eraser, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateEmailFn } from "@/lib/ai.functions";
import { useAnalysis } from "@/lib/analysis-store";
import { AiNote, CopyButton, EmptyState, ErrorAlert, Field, inputClass, LoadingBlock, PageHeader, Panel } from "@/components/ui-bits";

export const Route = createFileRoute("/email")({
  head: () => ({
    meta: [
      { title: "Email Generator — Meridian AI" },
      {
        name: "description",
        content: "Generate professional business emails from data-analysis context, in the tone your audience expects.",
      },
      { property: "og:title", content: "Email Generator — Meridian AI" },
      {
        property: "og:description",
        content: "Generate professional business emails from data-analysis context, in the tone your audience expects.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmailPage,
});

const TONES = ["Formal", "Friendly", "Persuasive"] as const;

function EmailPage() {
  const { dataset, insights } = useAnalysis();
  const [purpose, setPurpose] = useState("");
  const [audience, setAudience] = useState("");
  const [context, setContext] = useState("");
  const [keyPoints, setKeyPoints] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]>("Formal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);

  const prefillFromInsights = () => {
    if (insights.length === 0) return;
    setContext(insights.map((i) => `${i.insight} (Evidence: ${i.evidence})`).join("\n"));
    toast.success("Loaded current insights into the context field.");
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateEmailFn({ data: { purpose, audience, context, keyPoints, tone } });
      setResult(res);
      toast.success("Email generated.");
    } catch {
      setError("Unable to generate a response right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setPurpose("");
    setAudience("");
    setContext("");
    setKeyPoints("");
    setTone("Formal");
    setResult(null);
    setError(null);
  };

  const canGenerate = purpose.trim() && audience.trim() && context.trim() && !loading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Smart Email Generator"
        description="Turn analysis findings and business context into clear, professional emails matched to your audience."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Input */}
        <Panel title="Your Input">
          <div className="space-y-4">
            <Field label="Email purpose">
              <input
                className={inputClass}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Report a 15% monthly revenue decline and propose next steps"
              />
            </Field>
            <Field label="Recipient / audience">
              <input
                className={inputClass}
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Regional Sales Manager"
              />
            </Field>
            <Field label="Context or findings">
              <textarea
                className={inputClass + " min-h-32 resize-y"}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Describe the situation, findings, or analysis results…"
              />
            </Field>
            {insights.length > 0 && (
              <button
                type="button"
                onClick={prefillFromInsights}
                className="text-xs font-medium text-primary hover:underline"
              >
                Insert current AI insights as context
              </button>
            )}
            <Field label="Key information to include (optional)">
              <textarea
                className={inputClass + " min-h-20 resize-y"}
                value={keyPoints}
                onChange={(e) => setKeyPoints(e.target.value)}
                placeholder="Specific figures, deadlines, or requests…"
              />
            </Field>
            <Field label="Tone">
              <div className="flex gap-2">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      tone === t
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-foreground hover:bg-secondary"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> {loading ? "Generating…" : "Generate Email"}
              </button>
              <button
                type="button"
                onClick={clear}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                <Eraser className="h-4 w-4" /> Clear
              </button>
            </div>
          </div>
        </Panel>

        {/* Output */}
        <Panel
          title="AI Output"
          badge={result ? tone : undefined}
          actions={result ? <CopyButton text={`Subject: ${result.subject}\n\n${result.body}`} label="Copy Email" /> : undefined}
        >
          {error ? <div className="mb-4"><ErrorAlert message={error} /></div> : null}
          {loading ? (
            <LoadingBlock label="Drafting your email…" />
          ) : !result ? (
            <EmptyState
              title="No email generated yet"
              hint="Describe the purpose, audience, and findings on the left, choose a tone, and select Generate Email."
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="panel-label mb-1">Subject</p>
                <p className="text-sm font-semibold text-foreground">{result.subject}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-5">
                {result.body.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className="mb-3 text-sm leading-relaxed text-foreground last:mb-0">
                    {para}
                  </p>
                ))}
              </div>
              <AiNote />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
