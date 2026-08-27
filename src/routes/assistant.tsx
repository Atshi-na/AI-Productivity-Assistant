import { useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import { Bot, Eraser, Loader2, Send, User } from "lucide-react";
import { useAnalysis } from "@/lib/analysis-store";
import { calculateDatasetAnswer } from "@/lib/data-analysis";
import { CopyButton, ErrorAlert, PageHeader, Panel } from "@/components/ui-bits";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant — Meridian AI" },
      {
        name: "description",
        content: "Ask a professional data and business analyst assistant about trends, KPIs, findings, and stakeholder communication.",
      },
      { property: "og:title", content: "AI Assistant — Meridian AI" },
      {
        property: "og:description",
        content: "Ask a professional data and business analyst assistant about trends, KPIs, findings, and stakeholder communication.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

const SUGGESTED = [
  "What was our total revenue?",
  "Which region generated the most revenue?",
  "What was our best-performing product last month?",
  "Which product had the highest profit?",
  "Which category performed the worst?",
  "Why did revenue fall in the weakest month?",
  "What are the most important findings in this dataset?",
  "What should management focus on?",
];

function messageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("");
}

function AssistantPage() {
  const { dataset, insights } = useAnalysis();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const datasetContext = useMemo(() => {
    if (!dataset) return undefined;
    let ctx = dataset.analystContext || dataset.summaryText;
    if (insights.length) {
      ctx += `\n\nGenerated insights:\n${insights.map((i, n) => `${n + 1}. ${i.insight} (evidence: ${i.evidence})`).join("\n")}`;
    }
    return ctx;
  }, [dataset, insights]);

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const calculationContext = dataset ? calculateDatasetAnswer(trimmed, dataset)?.promptContext : undefined;
    setInput("");
    sendMessage({ text: trimmed }, { body: { datasetContext, calculationContext } });
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 100);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col space-y-4 lg:h-[calc(100vh-9rem)]">
      <PageHeader
        title="AI Assistant"
        description={
          dataset
            ? `Your analyst assistant. Currently grounded in "${dataset.name}" (${dataset.rowCount.toLocaleString()} rows).`
            : "Your data & business analyst assistant. Load a dataset on the Data Analysis page to ground answers in real figures."
        }
        actions={
          messages.length > 0 ? (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
            >
              <Eraser className="h-3.5 w-3.5" /> Clear conversation
            </button>
          ) : undefined
        }
      />

      <Panel className="flex min-h-0 flex-1 flex-col !p-0">
        {/* Messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">How can I help with your analysis?</p>
                <p className="mt-1 text-xs text-muted-foreground">Ask about trends, KPIs, findings, or stakeholder communication.</p>
              </div>
              <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => {
                const text = messageText(m.parts as Array<{ type: string; text?: string }>);
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && (
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-3 sm:max-w-[75%] ${
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-muted/40 text-foreground"
                      }`}
                    >
                      {isUser ? (
                        <p className="text-sm leading-relaxed">{text}</p>
                      ) : (
                        <div className="prose-sm text-sm leading-relaxed [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:pl-5 [&_p]:my-2 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal">
                          <ReactMarkdown>{text}</ReactMarkdown>
                        </div>
                      )}
                      {!isUser && text && !busy && (
                        <div className="mt-2 border-t border-border/60 pt-2">
                          <CopyButton text={text} label="Copy response" />
                        </div>
                      )}
                    </div>
                    {isUser && (
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
              {status === "submitted" && (
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Analyzing…</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border p-4">
          {error ? (
            <div className="mb-3">
              <ErrorAlert message="Unable to generate a response right now. Please try again." />
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data, KPIs, findings, or communication…"
              className="flex-1 rounded-md border border-input bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-2 text-[10.5px] text-muted-foreground">
            AI outputs are decision-support tools and should not replace professional judgment.
          </p>
        </div>
      </Panel>
    </div>
  );
}
