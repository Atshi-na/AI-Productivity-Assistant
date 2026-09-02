import Papa from "papaparse";
import { profileCsv, type DatasetProfile } from "./data-analysis";

/** One human-readable action taken on a single column. */
export interface ColumnFix {
  column: string;
  actions: string[];
}

/** Something the cleaner refused to change on its own. */
export interface ReviewItem {
  column: string;
  issue: string;
}

/** Possible outliers — reported, never deleted. */
export interface OutlierNote {
  column: string;
  count: number;
  detail: string;
}

export interface CleaningReport {
  before: { rows: number; missing: number; duplicates: number; columns: number };
  after: { rows: number; missing: number; duplicates: number; columns: number };
  duplicatesRemoved: number;
  rowsRemoved: number;
  valuesFilled: number;
  valuesTrimmed: number;
  invalidValuesFixed: number;
  typesNormalized: number;
  typesCorrected: number;
  textColumnsTrimmed: number;
  numericColumnsFixed: number;
  dateColumnsFixed: number;
  columnsRemoved: string[];
  needsReview: ReviewItem[];
  outliers: OutlierNote[];
  columnFixes: ColumnFix[];
  notes: string[];
}

const MISSING_MARKERS = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "n.a.",
  "null",
  "nil",
  "none",
  "nan",
  "unknown",
  "not available",
  "?",
]);

const OPTIONAL_RE = /director|cast|actor|description|notes?|comment|summary|tags?|genre|listed[_\s-]?in|address|email|phone|url|link/i;
const ESSENTIAL_RE = /^(id|show_id|_id)$|(^|[_\s-])(id|title|name|type|date|region|product|category)([_\s-]|$)/i;

const isMissing = (v: string): boolean => MISSING_MARKERS.has(v.trim().toLowerCase());

const tidy = (v: string): string => v.replace(/\s+/g, " ").trim();

const numericCandidate = (v: string): string | null => {
  const stripped = v.replace(/[$€£R\s,]/g, "").replace(/%$/, "");
  if (stripped === "" || Number.isNaN(Number(stripped))) return null;
  return stripped;
};

const median = (vals: number[]): number => {
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

const iso = (v: string): string | null => {
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * AI-assisted cleaning pass: quality check → repair → validate.
 * Rows are only removed when they are exact duplicates, fully empty, or missing
 * an essential identifying column. Optional text (director, cast, …) is never a
 * reason to delete a record.
 */
export function cleanDataset(profile: DatasetProfile): { profile: DatasetProfile; report: CleaningReport } {
  const headers = profile.columns.map((c) => c.name);
  const rows = profile.records.map((r) => ({ ...r }));

  const before = {
    rows: profile.rowCount,
    missing: profile.totalMissing,
    duplicates: profile.duplicateRows,
    columns: profile.columnCount,
  };

  const fixes = new Map<string, Set<string>>();
  const note = (column: string, action: string) => {
    const set = fixes.get(column) ?? new Set<string>();
    set.add(action);
    fixes.set(column, set);
  };

  let valuesTrimmed = 0;
  let invalidValuesFixed = 0;
  let typesNormalized = 0;
  let valuesFilled = 0;
  const trimmedColumns = new Set<string>();
  const numericColumns = new Set<string>();
  const dateColumns = new Set<string>();
  const needsReview: ReviewItem[] = [];
  const outliers: OutlierNote[] = [];

  // --- 1. Whitespace + missing-marker normalisation --------------------------
  for (const row of rows) {
    for (const h of headers) {
      const raw = row[h] ?? "";
      const cleaned = tidy(raw);
      if (cleaned !== raw) {
        valuesTrimmed++;
        trimmedColumns.add(h);
        note(h, "removed extra whitespace");
      }
      if (isMissing(cleaned)) {
        if (cleaned !== "") note(h, "standardised missing-value markers");
        row[h] = "";
      } else {
        row[h] = cleaned;
      }
    }
  }

  // --- 2. Type detection + per-column repair ---------------------------------
  for (const col of profile.columns) {
    const h = col.name;
    const present = rows.map((r) => r[h] ?? "").filter((v) => v !== "");
    if (present.length === 0) continue;

    const numericOk = present.filter((v) => numericCandidate(v) !== null).length;
    const dateOk = present.filter((v) => /\d{4}|\d{1,2}[-/]\d{1,2}/.test(v) && iso(v) !== null).length;

    // Values we cannot classify at all get flagged rather than changed.
    if (numericOk / present.length < 0.8 && dateOk / present.length < 0.8 && numericOk / present.length >= 0.4) {
      needsReview.push({
        column: h,
        issue: "This column mixes numbers and text, so it was left exactly as it is. Needs Review.",
      });
    }

    if (numericOk / present.length >= 0.8) {
      // Numeric column: strip formatting, blank out invalid values, fill gaps with the median.

      const numbers: number[] = [];
      for (const row of rows) {
        const v = row[h] ?? "";
        if (v === "") continue;
        const n = numericCandidate(v);
        if (n === null) {
          row[h] = "";
          invalidValuesFixed++;
          note(h, "cleared values that are not valid numbers");
          continue;
        }
        if (n !== v) {
          typesNormalized++;
          numericColumns.add(h);
          note(h, "converted text to proper numbers");
        }
        row[h] = n;
        numbers.push(Number(n));
      }
      const gaps = rows.filter((r) => (r[h] ?? "") === "").length;
      if (gaps > 0 && numbers.length > 0 && !ESSENTIAL_RE.test(h)) {
        const fill = String(Math.round(median(numbers) * 100) / 100);
        for (const row of rows) {
          if ((row[h] ?? "") === "") {
            row[h] = fill;
            valuesFilled++;
          }
        }
        note(h, `filled ${gaps} missing value${gaps === 1 ? "" : "s"} with the typical value (${fill})`);
      } else if (gaps > 0) {
        needsReview.push({
          column: h,
          issue: `${gaps} missing value${gaps === 1 ? "" : "s"} in an important column were left blank instead of being guessed. Needs Review.`,
        });
      }
      // Possible outliers are reported only — valid extreme values are never deleted.
      if (numbers.length >= 12) {
        const sorted = [...numbers].sort((a, b) => a - b);
        const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] as number;
        const q1 = q(0.25);
        const q3 = q(0.75);
        const iqr = q3 - q1;
        if (iqr > 0) {
          const lo = q1 - 1.5 * iqr;
          const hi = q3 + 1.5 * iqr;
          const odd = numbers.filter((n) => n < lo || n > hi);
          if (odd.length > 0) {
            outliers.push({
              column: h,
              count: odd.length,
              detail: `${odd.length} value${odd.length === 1 ? " is" : "s are"} much higher or lower than the rest (outside ${
                Math.round(lo * 100) / 100
              } to ${Math.round(hi * 100) / 100}). Kept as-is for review.`,
            });
          }
        }
      }
      continue;
    }

    if (dateOk / present.length >= 0.8) {

      for (const row of rows) {
        const v = row[h] ?? "";
        if (v === "") continue;
        const d = iso(v);
        if (d === null) {
          row[h] = "";
          invalidValuesFixed++;
          note(h, "cleared values that are not valid dates");
        } else if (d !== v) {
          row[h] = d;
          typesNormalized++;
          dateColumns.add(h);
          note(h, "standardised dates to YYYY-MM-DD");
        }
      }
      continue;
    }

    // Text column: unify variants that differ only by case/spacing.
    if (col.unique <= Math.max(40, rows.length * 0.5)) {
      const counts = new Map<string, Map<string, number>>();
      for (const row of rows) {
        const v = row[h] ?? "";
        if (v === "") continue;
        const key = v.toLowerCase();
        const inner = counts.get(key) ?? new Map<string, number>();
        inner.set(v, (inner.get(v) ?? 0) + 1);
        counts.set(key, inner);
      }
      const canonical = new Map<string, string>();
      for (const [key, variants] of counts) {
        if (variants.size <= 1) continue;
        const best = [...variants.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best) canonical.set(key, best[0]);
      }
      if (canonical.size > 0) {
        for (const row of rows) {
          const v = row[h] ?? "";
          const target = canonical.get(v.toLowerCase());
          if (target && target !== v) {
            row[h] = target;
            typesNormalized++;
          }
        }
        note(h, "unified inconsistent spellings/capitalisation");
      }
    }

    // Optional text: label gaps instead of deleting the record.
    const gaps = rows.filter((r) => (r[h] ?? "") === "").length;
    if (gaps > 0 && OPTIONAL_RE.test(h)) {
      for (const row of rows) {
        if ((row[h] ?? "") === "") {
          row[h] = "Not specified";
          valuesFilled++;
        }
      }
      note(h, `labelled ${gaps} missing entr${gaps === 1 ? "y" : "ies"} as "Not specified" (records kept)`);
    }
  }

  // --- 3. Row-level validation ----------------------------------------------
  const essential = headers.filter((h) => ESSENTIAL_RE.test(h) && !OPTIONAL_RE.test(h));
  const seen = new Set<string>();
  let duplicatesRemoved = 0;
  let emptyRemoved = 0;
  let invalidRowsRemoved = 0;

  const kept = rows.filter((row) => {
    const values = headers.map((h) => row[h] ?? "");
    if (values.every((v) => v === "")) {
      emptyRemoved++;
      return false;
    }
    if (essential.length > 0 && essential.every((h) => (row[h] ?? "") === "")) {
      invalidRowsRemoved++;
      return false;
    }
    const key = values.join("\u0001");
    if (seen.has(key)) {
      duplicatesRemoved++;
      return false;
    }
    seen.add(key);
    return true;
  });

  const cleanedCsv = Papa.unparse({ fields: headers, data: kept.map((r) => headers.map((h) => r[h] ?? "")) });
  const cleanedProfile = profileCsv(cleanedCsv, profile.name);

  const notes: string[] = [];
  if (duplicatesRemoved) notes.push(`Removed ${duplicatesRemoved} duplicate record${duplicatesRemoved === 1 ? "" : "s"}.`);
  if (emptyRemoved) notes.push(`Removed ${emptyRemoved} completely empty row${emptyRemoved === 1 ? "" : "s"}.`);
  if (invalidRowsRemoved)
    notes.push(`Removed ${invalidRowsRemoved} record${invalidRowsRemoved === 1 ? "" : "s"} with no identifying information.`);
  if (valuesTrimmed) notes.push(`Trimmed extra spaces from ${valuesTrimmed} value${valuesTrimmed === 1 ? "" : "s"}.`);
  if (typesNormalized) notes.push(`Standardised ${typesNormalized} value${typesNormalized === 1 ? "" : "s"} to the correct format.`);
  if (invalidValuesFixed) notes.push(`Cleared ${invalidValuesFixed} invalid value${invalidValuesFixed === 1 ? "" : "s"}.`);
  if (valuesFilled) notes.push(`Filled ${valuesFilled} missing value${valuesFilled === 1 ? "" : "s"} using safe, column-appropriate rules.`);
  notes.push("Records with missing optional details (such as director or cast) were kept, not deleted.");
  if (notes.length === 1) notes.unshift("No issues needed fixing — the dataset was already clean.");

  return {
    profile: cleanedProfile,
    report: {
      before,
      after: {
        rows: cleanedProfile.rowCount,
        missing: cleanedProfile.totalMissing,
        duplicates: cleanedProfile.duplicateRows,
        columns: cleanedProfile.columnCount,
      },
      duplicatesRemoved,
      rowsRemoved: duplicatesRemoved + emptyRemoved + invalidRowsRemoved,
      valuesFilled,
      valuesTrimmed,
      invalidValuesFixed,
      typesNormalized,
      columnFixes: [...fixes.entries()].map(([column, actions]) => ({ column, actions: [...actions] })),
      notes,
    },
  };
}
