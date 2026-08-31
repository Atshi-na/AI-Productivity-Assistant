import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DatasetProfile } from "./data-analysis";
import type { CleaningReport } from "./data-cleaning";
import type { Insight, Recommendation } from "./ai.functions";

interface AnalysisState {
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
  dataset: DatasetProfile | null;
  insights: Insight[];
  recommendations: Recommendation[];
  cleaning: CleaningReport | null;
}

const EMPTY: Persisted = { dataset: null, insights: [], recommendations: [], cleaning: null };

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
      dataset: state.dataset,
      insights: state.insights,
      recommendations: state.recommendations,
      cleaning: state.cleaning,
      setDataset: (dataset) =>
        setState((s) => ({
          dataset,
          insights: [],
          recommendations: dataset && s.dataset?.name === dataset.name ? s.recommendations : [],
          cleaning: null,
        })),
      setInsights: (insights) => setState((s) => ({ ...s, insights })),
      setRecommendations: (recommendations) => setState((s) => ({ ...s, recommendations })),
      // Cleaning replaces the working dataset: every downstream KPI, chart, insight,
      // recommendation and assistant answer then uses the cleaned records.
      setCleaned: (dataset, cleaning) => setState(() => ({ dataset, cleaning, insights: [], recommendations: [] })),
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
