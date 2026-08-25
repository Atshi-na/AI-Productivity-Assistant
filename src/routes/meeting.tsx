import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eraser, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { summarizeMeetingFn, type MeetingSummary } from "@/lib/ai.functions";
import { AiNote, CopyButton, EmptyState, ErrorAlert, Field, inputClass, LoadingBlock, PageHeader, Panel } from "@/components/ui-bits";

export const Route = createFileRoute("/meeting")({
  head: () => ({
    meta: [
      { title: "Meeting Insights — Meridian AI" },
      {
        name: "description",
        content: "Turn long meeting notes into structured summaries with decisions, action items, owners, and next steps.",
      },
      { property: "og:title", content: "Meeting Insights — Meridian AI" },
      {
        property: "og:description",
        content: "Turn long meeting notes into structured summaries with decisions, action items, owners, and next steps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeetingPage,
});

function summaryToText(s: MeetingSummary): string {
  const actions = s.actionItems.map((a) => `- ${a.task} (Owner: ${a.owner}, Deadline: ${a.deadline})`).join("\n");
  return [
    "EXECUTIVE SUMMARY",
    s.executiveSummary,
    "",
    "KEY DISCUSSION POINTS",
    ...s.keyDiscussionPoints.map((p) => `- ${p}`),
    "",
    "DECISIONS MADE",
    ...s.decisionsMade.map((d) => `- ${d}`),
    "",
    "ACTION ITEMS",
    actions,
    "",
    "BUSINESS IMPLICATIONS",
    ...s.businessImplications.map((b) => `- ${b}`),
    "",
    "RECOMMENDED NEXT STEPS",
    ...s.recommendedNextSteps.map((n) => `- ${n}`),
  ].join("\n");
}

function MeetingPage() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MeetingSummary | null>(null);

  const summarize = async () => {
    if (!notes.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await summarizeMeetingFn({ data: { notes, title, date } });
      setSummary(result);
      toast.success("Meeting summarized.");
    } catch {
      setError("Unable to generate a response right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setTitle("");
    setDate("");
    setNotes("");
    setSummary(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meeting Notes Summarizer"
        description="Paste raw meeting notes and convert them into structured, scannable business information."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Input */}
        <Panel title="Your Input">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Meeting title (optional)">
                <input
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Q3 Sales Review"
                />
              </Field>
              <Field label="Meeting date (optional)">
                <input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Meeting notes">
              <textarea
                className={inputClass + " min-h-64 resize-y"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste your full meeting notes here…"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={summarize}
                disabled={loading || !notes.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> {loading ? "Summarizing…" : "Summarize"}
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
          actions={summary ? <CopyButton text={summaryToText(summary)} label="Copy Summary" /> : undefined}
        >
          {error ? <div className="mb-4"><ErrorAlert message={error} /></div> : null}
          {loading ? (
            <LoadingBlock label="Structuring your meeting notes…" />
          ) : !summary ? (
            <EmptyState
              title="Nothing to summarize yet"
              hint="Paste meeting notes on the left and select Summarize. Decisions, owners, and deadlines are only reported when they appear in your notes."
            />
          ) : (
            <div className="space-y-5">
              {(title || date) && (
                <div className="flex flex-wrap gap-2">
                  {title && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{title}</span>}
                  {date && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{date}</span>}
                </div>
              )}
              <Section title="Executive Summary">
                <p className="text-sm leading-relaxed text-foreground">{summary.executiveSummary}</p>
              </Section>
              <Section title="Key Discussion Points">
                <BulletList items={summary.keyDiscussionPoints} />
              </Section>
              <Section title="Decisions Made">
                <BulletList items={summary.decisionsMade} />
              </Section>
              <Section title="Action Items">
                {summary.actionItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not specified in the notes.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[360px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="pb-2 pr-3 font-medium">Task</th>
                          <th className="pb-2 pr-3 font-medium">Responsible</th>
                          <th className="pb-2 font-medium">Deadline</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.actionItems.map((a, i) => (
                          <tr key={i} className="border-b border-border/50 last:border-0">
                            <td className="py-2 pr-3 text-foreground">{a.task}</td>
                            <td className="py-2 pr-3">
                              <span className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-medium text-accent-foreground">
                                {a.owner}
                              </span>
                            </td>
                            <td className="py-2 text-muted-foreground">{a.deadline}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
              <Section title="Business Implications">
                <BulletList items={summary.businessImplications} />
              </Section>
              <Section title="Recommended Next Steps">
                <BulletList items={summary.recommendedNextSteps} />
              </Section>
              <AiNote />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4">
      <h3 className="panel-label mb-2">{title}</h3>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Not specified in the notes.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}
