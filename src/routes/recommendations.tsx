import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lightbulb, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAnalysis } from "@/lib/analysis-store";
import { generateRecommendationsFn } from "@/lib/ai.functions";
import { AiNote, EmptyState, ErrorAlert, LoadingBlock, PageHeader, Panel, PriorityBadge } from "@/components/ui-bits";

export const Route = createFileRoute("/recommendations")({
  head: () => ({
    meta: [
      { title: "AI Recommendations — Meridian AI" },
      {
        name: "description",
        content: "Convert data-driven findings into prioritized, practical business recommendations.",
      },
      { property: "og:title", content: "AI Recommendations — Meridian AI" },
      {
        property: "og:description",
        content: "Convert data-driven findings into prioritized, practical business recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecommendationsPage,
});

function RecommendationsPage() {
  const { dataset, insights, recommendations, setRecommendations } = useAnalysis();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!dataset) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateRecommendationsFn({
        data: { summaryText: dataset.summaryText, insights },
      });
      setRecommendations(result);
      toast.success(`${result.length} recommendations generated.`);
    } catch {
      setError("Unable to generate a response right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Recommendation Engine"
        description="Turns the dataset's findings and generated insights into prioritized, actionable business recommendations."
        actions={
          dataset ? (
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "Generating…" : recommendations.length ? "Regenerate recommendations" : "Generate recommendations"}
            </button>
          ) : undefined
        }
      />

      {!dataset ? (
        <EmptyState
          title="No dataset loaded"
          hint="Upload a CSV file or load the sample dataset to begin analysis. Recommendations are generated from real dataset figures."
          icon={<Lightbulb className="h-8 w-8" />}
        />
      ) : (
        <Panel
          title="Recommendations"
          badge={insights.length ? `Based on ${insights.length} insights` : "Based on dataset facts"}
        >
          {insights.length === 0 && (
            <p className="mb-4 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
              Tip: generate AI insights on the{" "}
              <Link to="/analysis" className="font-medium underline">
                Data Analysis
              </Link>{" "}
              page first for richer recommendations. You can also generate directly from dataset facts.
            </p>
          )}
          {error ? <div className="mb-4"><ErrorAlert message={error} /></div> : null}
          {loading ? (
            <LoadingBlock label="Converting findings into prioritized actions…" />
          ) : recommendations.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              hint="Run the recommendation engine to convert the current analysis into prioritized business actions."
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {recommendations.map((rec, i) => (
                  <article key={i} className="flex flex-col rounded-lg border border-border bg-muted/30 p-5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="panel-label">Recommendation {i + 1}</span>
                      <PriorityBadge priority={rec.priority} />
                    </div>
                    <dl className="flex-1 space-y-3">
                      <div>
                        <dt className="panel-label mb-1">Finding</dt>
                        <dd className="text-sm text-foreground">{rec.finding}</dd>
                      </div>
                      <div>
                        <dt className="panel-label mb-1">Business impact</dt>
                        <dd className="text-sm text-muted-foreground">{rec.impact}</dd>
                      </div>
                      <div>
                        <dt className="panel-label mb-1">Recommendation</dt>
                        <dd className="text-sm font-medium text-foreground">{rec.recommendation}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 rounded-md border border-primary/20 bg-accent px-3 py-2">
                      <p className="panel-label mb-0.5">Suggested next step</p>
                      <p className="text-xs font-medium text-accent-foreground">{rec.nextStep}</p>
                    </div>
                  </article>
                ))}
              </div>
              <AiNote />
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
