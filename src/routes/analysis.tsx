import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Database, FileUp, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAnalysis } from "@/lib/analysis-store";
import { profileCsv, type DatasetProfile } from "@/lib/data-analysis";
import { generateSampleDataset, sampleDatasetToCsv } from "@/lib/sample-data";
import { generateInsightsFn, type InsightStatus } from "@/lib/ai.functions";
import { BarsChart, DonutChart, TrendChart } from "@/components/charts";
import { AiNote, EmptyState, ErrorAlert, LoadingBlock, PageHeader, Panel } from "@/components/ui-bits";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Data Analysis — Meridian AI" },
      {
        name: "description",
        content: "Upload a CSV dataset, review KPIs, charts, and data quality, then generate AI-powered business insights.",
      },
      { property: "og:title", content: "Data Analysis — Meridian AI" },
      {
        property: "og:description",
        content: "Upload a CSV dataset, review KPIs, charts, and data quality, then generate AI-powered business insights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataAnalysisPage,
});

function DataAnalysisPage() {
  const { dataset, insights, setDataset, setInsights } = useAnalysis();
  const [error, setError] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadProfile = (profile: DatasetProfile) => {
    setDataset(profile);
    setError(null);
    toast.success(`Loaded "${profile.name}" — ${profile.rowCount.toLocaleString()} rows analyzed.`);
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      loadProfile(profileCsv(text, file.name));
    } catch {
      setError("We couldn't analyze this dataset. Please check that the file contains valid tabular data.");
    }
  };

  const loadSample = () => {
    try {
      const csv = sampleDatasetToCsv(generateSampleDataset());
      loadProfile(profileCsv(csv, "Sample Sales Dataset (2025)"));
    } catch {
      setError("We couldn't analyze this dataset. Please check that the file contains valid tabular data.");
    }
  };

  const generateInsights = async () => {
    if (!dataset) return;
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const result = await generateInsightsFn({ data: { summaryText: dataset.summaryText } });
      setInsights(result);
      toast.success(`${result.length} insights generated.`);
    } catch {
      setInsightsError("Unable to generate a response right now. Please try again.");
    } finally {
      setInsightsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Analysis"
        description="Upload a CSV dataset or load the sample sales dataset to explore KPIs, visualizations, data quality, and AI-generated insights."
        actions={
          dataset ? (
            <button
              type="button"
              onClick={() => setDataset(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear dataset
            </button>
          ) : undefined
        }
      />

      {/* Upload / sample */}
      <Panel title="Dataset">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <FileUp className="h-4 w-4" /> Upload CSV
          </button>
          <button
            type="button"
            onClick={loadSample}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Database className="h-4 w-4" /> Load sample dataset
          </button>
          {dataset ? (
            <p className="text-sm text-muted-foreground">
              Loaded: <span className="font-medium text-foreground">{dataset.name}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">The sample dataset contains a year of sales records with regions, products, segments, and profitability.</p>
          )}
        </div>
        {error ? <div className="mt-4"><ErrorAlert message={error} /></div> : null}
      </Panel>

      {!dataset ? (
        <EmptyState
          title="No dataset loaded"
          hint="Upload a CSV file or load the sample dataset to begin analysis."
          icon={<Database className="h-8 w-8" />}
        />
      ) : (
        <>
          {/* Overview */}
          <Panel title="Dataset Overview" badge={dataset.name}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <OverviewStat label="Rows" value={dataset.rowCount.toLocaleString()} />
              <OverviewStat label="Columns" value={String(dataset.columnCount)} />
              <OverviewStat label="Missing values" value={String(dataset.totalMissing)} warn={dataset.totalMissing > 0} />
              <OverviewStat label="Duplicate rows" value={String(dataset.duplicateRows)} warn={dataset.duplicateRows > 0} />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Column</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Missing</th>
                    <th className="pb-2 font-medium">Unique values</th>
                  </tr>
                </thead>
                <tbody>
                  {dataset.columns.map((c) => (
                    <tr key={c.name} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 font-medium text-foreground">{c.name}</td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-secondary-foreground">
                          {c.type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{c.missing}</td>
                      <td className="py-2 text-muted-foreground">{c.unique}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* KPI cards */}
          {dataset.kpis.length > 0 && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {dataset.kpis.map((kpi) => (
                <div key={kpi.label} className="panel p-4">
                  <p className="panel-label">{kpi.label}</p>
                  <p className="kpi-value mt-2 text-xl font-semibold text-foreground">{kpi.value}</p>
                  {kpi.detail ? <p className="mt-1 text-[10.5px] text-muted-foreground">{kpi.detail}</p> : null}
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {dataset.trend.length > 1 && (
              <Panel title={dataset.trendLabel}>
                <TrendChart data={dataset.trend} />
              </Panel>
            )}
            {dataset.bars.length > 0 && (
              <Panel title={dataset.barsLabel}>
                <BarsChart data={dataset.bars} />
              </Panel>
            )}
            {dataset.donut.length > 1 && (
              <Panel title={dataset.donutLabel}>
                <DonutChart data={dataset.donut} />
              </Panel>
            )}
          </div>

          {/* Data quality */}
          <Panel title="Data Quality" badge={dataset.warnings.length ? `${dataset.warnings.length} findings` : "Clean"}>
            {dataset.warnings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data-quality issues detected in this dataset.</p>
            ) : (
              <ul className="space-y-2">
                {dataset.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* AI Insights */}
          <Panel
            title="AI Insights"
            actions={
              <button
                type="button"
                onClick={generateInsights}
                disabled={insightsLoading}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {insightsLoading ? "Generating…" : insights.length ? "Regenerate insights" : "Generate AI insights"}
              </button>
            }
          >
            {insightsError ? <div className="mb-4"><ErrorAlert message={insightsError} /></div> : null}
            {insightsLoading ? (
              <LoadingBlock label="Analyzing dataset and generating insights…" />
            ) : insights.length === 0 ? (
              <EmptyState
                title="No insights yet"
                hint="Generate AI-powered business insights based on the dataset's actual figures. Insights appear on the Dashboard and feed the Recommendation Engine."
              />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {insights.map((ins, i) => (
                    <article key={i} className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{ins.insight}</p>
                        <StatusBadge status={ins.status} />
                      </div>
                      <div className="mt-3 space-y-2">
                        <div>
                          <p className="panel-label mb-1">What the data shows</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">{ins.evidence}</p>
                        </div>
                        <div>
                          <p className="panel-label mb-1">Why it matters</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">{ins.impact}</p>
                        </div>
                        {ins.recommendation ? (
                          <div>
                            <p className="panel-label mb-1">Recommendation</p>
                            <p className="text-xs leading-relaxed text-muted-foreground">{ins.recommendation}</p>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
                <AiNote />
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/** Three plain-English insight statuses only. */
function StatusBadge({ status }: { status?: InsightStatus }) {
  const resolved: InsightStatus =
    status === "High Priority" || status === "Needs Attention" ? status : "Stable";
  const styles: Record<InsightStatus, string> = {
    Stable: "bg-success/10 text-success",
    "Needs Attention": "bg-warning/20 text-warning-foreground",
    "High Priority": "bg-destructive/10 text-destructive",
  };
  const dot: Record<InsightStatus, string> = {
    Stable: "🟢",
    "Needs Attention": "🟡",
    "High Priority": "🔴",
  };
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${styles[resolved]}`}>
      {dot[resolved]} {resolved}
    </span>
  );
}


function OverviewStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="panel-label">{label}</p>
      <p className={`kpi-value mt-1 text-xl font-semibold ${warn ? "text-warning-foreground" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
