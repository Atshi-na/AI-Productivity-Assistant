import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Database,
  Lightbulb,
  ListChecks,
  Mail,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { useAnalysis } from "@/lib/analysis-store";
import { EmptyState, PageHeader, Panel, PriorityBadge } from "@/components/ui-bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Meridian AI" },
      {
        name: "description",
        content:
          "AI-Powered Data & Workplace Productivity Assistant. Turn business information into insights, recommendations, and action.",
      },
      { property: "og:title", content: "Dashboard — Meridian AI" },
      {
        property: "og:description",
        content: "Turn business information into insights, recommendations, and action.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const QUICK_ACTIONS = [
  { to: "/analysis", label: "Analyze Data", icon: BarChart3 },
  { to: "/meeting", label: "Summarize Meeting", icon: ClipboardList },
  { to: "/email", label: "Generate Email", icon: Mail },
  { to: "/assistant", label: "Ask AI Assistant", icon: MessageSquareText },
] as const;

function Dashboard() {
  const { dataset, insights, recommendations } = useAnalysis();

  const kpis = [
    {
      label: "Dataset Records",
      value: dataset ? dataset.rowCount.toLocaleString() : "—",
      icon: Database,
      hint: dataset ? dataset.name : "No dataset loaded",
    },
    {
      label: "Insights Generated",
      value: insights.length ? String(insights.length) : "—",
      icon: Sparkles,
      hint: insights.length ? "From current dataset" : "None yet",
    },
    {
      label: "Recommendations",
      value: recommendations.length ? String(recommendations.length) : "—",
      icon: Lightbulb,
      hint: recommendations.length ? "Ready to review" : "None yet",
    },
    {
      label: "High-Priority Actions",
      value: recommendations.length ? String(recommendations.filter((r) => r.priority === "High").length) : "—",
      icon: ListChecks,
      hint: "From recommendation engine",
    },
  ];

  const priorityRecs = [...recommendations]
    .sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 } as const;
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    })
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI-Powered Data & Workplace Productivity Assistant"
        description="Turn business information into insights, recommendations, and action."
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, hint }) => (
          <div key={label} className="panel p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="panel-label">{label}</span>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="kpi-value mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{value}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <Panel title="Quick Actions">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              {label}
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Recent Insights" badge={insights.length ? String(insights.length) : undefined}>
          {insights.length === 0 ? (
            <EmptyState
              title="No insights generated yet"
              hint="Upload a CSV file or load the sample dataset to begin analysis, then generate AI insights from the Data Analysis page."
            />
          ) : (
            <ul className="space-y-3">
              {insights.slice(0, 3).map((ins, i) => (
                <li key={i} className="rounded-lg border border-border bg-muted/40 p-4">
                  <p className="text-sm font-medium text-foreground">{ins.insight}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{ins.impact}</p>
                </li>
              ))}
              <li>
                <Link to="/analysis" className="text-xs font-medium text-primary hover:underline">
                  View all insights →
                </Link>
              </li>
            </ul>
          )}
        </Panel>

        <Panel title="Priority Recommendations">
          {priorityRecs.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              hint="Generate insights on the Data Analysis page, then open AI Recommendations to convert findings into prioritized actions."
            />
          ) : (
            <ul className="space-y-3">
              {priorityRecs.map((rec, i) => (
                <li key={i} className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{rec.recommendation}</p>
                    <PriorityBadge priority={rec.priority} />
                  </div>
                  <p className="text-xs text-muted-foreground">{rec.finding}</p>
                </li>
              ))}
              <li>
                <Link to="/recommendations" className="text-xs font-medium text-primary hover:underline">
                  View all recommendations →
                </Link>
              </li>
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
