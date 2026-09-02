import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DatasetProfile } from "./data-analysis";
import { cleanDataset, type CleaningReport } from "./data-cleaning";
import type { Insight, Recommendation } from "./ai.functions";

interface AnalysisState {
  /** Untouched dataset exactly as uploaded/loaded. Never used for analysis. */
  raw: DatasetProfile | null;
  /** Cleaned dataset — the only one KPIs, charts and AI features read. */
  dataset: DatasetProfile | null;
  insights: Insight[];
  recommendations: Recommendation[];
  cleaning: CleaningReport | null;
  setDataset: (d: DatasetProfile | null) => void;
  setInsights: (i: Insight[]) => void;
  setRecommendations: (r: Recommendation[]) => void;
  setCleaned: (d: DatasetProfile, report: CleaningReport) => void;
}

const AnalysisContext = createContext<AnalysisState | null>(null);
const STORAGE_KEY = "meridian-analysis-state";

interface Persisted {
  raw: DatasetProfile | null;
  dataset: DatasetProfile | null;
  insights: Insight[];
  recommendations: Recommendation[];
  cleaning: CleaningReport | null;
}

const EMPTY: Persisted = { raw: null, dataset: null, insights: [], recommendations: [], cleaning: null };

function loadPersisted(): Persisted {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Persisted) };
  } catch {
    return EMPTY;
  }
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadPersisted());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full / unavailable — session state still works in memory
    }
  }, [state, hydrated]);

  const value = useMemo<AnalysisState>(
    () => ({
      raw: state.raw,
      dataset: state.dataset,
      insights: state.insights,
      recommendations: state.recommendations,
      cleaning: state.cleaning,
      // Loading data always runs the cleaning pass first: analysis only ever
      // sees cleaned records, while `raw` keeps the original file intact.
      setDataset: (incoming) =>
        setState(() => {
          if (!incoming) return EMPTY;
          try {
            const { profile, report } = cleanDataset(incoming);
            return { raw: incoming, dataset: profile, cleaning: report, insights: [], recommendations: [] };
          } catch {
            return { raw: incoming, dataset: incoming, cleaning: null, insights: [], recommendations: [] };
          }
        }),
      setInsights: (insights) => setState((s) => ({ ...s, insights })),
      setRecommendations: (recommendations) => setState((s) => ({ ...s, recommendations })),
      // Cleaning replaces the working dataset: every downstream KPI, chart, insight,
      // recommendation and assistant answer then uses the cleaned records.
      setCleaned: (dataset, cleaning) => setState((s) => ({ ...s, dataset, cleaning, insights: [], recommendations: [] })),
    }),
    [state],
  );

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis(): AnalysisState {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("useAnalysis must be used inside AnalysisProvider");
  return ctx;
}
