import Papa from "papaparse";

export type ColumnType = "number" | "date" | "string";

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  missing: number;
  unique: number;
}

export interface Kpi {
  label: string;
  value: string;
  detail?: string;
}

export interface ChartPoint {
  name: string;
  value: number;
}

export interface TimePoint {
  name: string;
  value: number;
}

export interface DatasetProfile {
  name: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  duplicateRows: number;
  totalMissing: number;
  warnings: string[];
  kpis: Kpi[];
  trend: TimePoint[]; // time series of the primary metric
  trendLabel: string;
  bars: ChartPoint[]; // primary metric by best categorical
  barsLabel: string;
  donut: ChartPoint[]; // share by second categorical
  donutLabel: string;
  summaryText: string; // compact factual summary sent to the AI
  analystContext: string; // detailed, pre-computed facts for the data-aware assistant
}

const REVENUE_RE = /revenue|sales|amount|total|income/i;
const PROFIT_RE = /profit|margin|earnings/i;
const QTY_RE = /quantity|qty|units|orders|volume|count/i;
const CUSTOMER_RE = /customer|client|account|company/i;
const DATE_RE = /date|day|time|period|month/i;

function looksLikeDate(v: string): boolean {
  if (!v) return false;
  if (!/[\d]{4}[-/]|[\d]{1,2}[-/][\d]{1,2}/.test(v)) return false;
  const t = Date.parse(v);
  return !Number.isNaN(t);
}

function fmtNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 10_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtMoney(n: number): string {
  return "$" + fmtNum(n);
}

export function profileCsv(csvText: string, name = "Uploaded dataset"): DatasetProfile {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data;
  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0 || rows.length === 0) {
    throw new Error("empty");
  }

  // --- Column typing -------------------------------------------------------
  const columns: ColumnProfile[] = headers.map((h) => {
    let missing = 0;
    let numeric = 0;
    let dates = 0;
    const uniques = new Set<string>();
    for (const row of rows) {
      const raw = (row[h] ?? "").toString().trim();
      if (raw === "") {
        missing++;
        continue;
      }
      uniques.add(raw);
      if (!Number.isNaN(Number(raw))) numeric++;
      else if (looksLikeDate(raw)) dates++;
    }
    const present = rows.length - missing;
    let type: ColumnType = "string";
    if (present > 0 && numeric / present >= 0.9) type = "number";
    else if (present > 0 && dates / present >= 0.8) type = "date";
    return { name: h, type, missing, unique: uniques.size };
  });

  // --- Data quality --------------------------------------------------------
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const row of rows) {
    const key = headers.map((h) => row[h]).join("");
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }
  const totalMissing = columns.reduce((s, c) => s + c.missing, 0);

  const warnings: string[] = [];
  if (duplicateRows > 0) warnings.push(`${duplicateRows} duplicate record${duplicateRows === 1 ? "" : "s"} detected.`);
  for (const c of columns) {
    if (c.missing > 0) {
      warnings.push(`${c.missing} missing value${c.missing === 1 ? "" : "s"} detected in the "${c.name}" column.`);
    }
  }
  const highCard = columns.find((c) => c.type === "string" && c.unique > rows.length * 0.9 && rows.length > 20);
  if (highCard) warnings.push(`"${highCard.name}" has nearly unique values per row — it may be an identifier rather than a dimension.`);
  const constCol = columns.find((c) => c.unique === 1);
  if (constCol) warnings.push(`"${constCol.name}" contains a single repeated value and adds no analytical signal.`);

  // --- Numeric aggregates ---------------------------------------------------
  const numericCols = columns.filter((c) => c.type === "number").map((c) => c.name);
  const sums: Record<string, number> = {};
  for (const n of numericCols) sums[n] = 0;
  const sumOf = (n: string): number => sums[n] ?? 0;
  for (const row of rows) {
    for (const n of numericCols) {
      const v = Number(row[n]);
      if (!Number.isNaN(v)) sums[n] = (sums[n] ?? 0) + v;
    }
  }

  const revenueCol = numericCols.find((n) => REVENUE_RE.test(n)) ?? numericCols[0];
  const profitCol = numericCols.find((n) => PROFIT_RE.test(n));
  const qtyCol = numericCols.find((n) => QTY_RE.test(n) && n !== revenueCol);
  const customerCol = columns.find((c) => CUSTOMER_RE.test(c.name) && c.type !== "number")?.name;
  const dateCol = columns.find((c) => c.type === "date" || DATE_RE.test(c.name))?.name;

  // --- KPIs ------------------------------------------------------------------
  const kpis: Kpi[] = [];
  if (revenueCol) {
    kpis.push({ label: `Total ${revenueCol}`, value: fmtMoney(sumOf(revenueCol)) });
    kpis.push({ label: `Average ${revenueCol}`, value: fmtMoney(sumOf(revenueCol) / rows.length), detail: "per record" });
  }
  if (qtyCol) kpis.push({ label: `Total ${qtyCol}`, value: fmtNum(sumOf(qtyCol)) });
  else kpis.push({ label: "Total Records", value: fmtNum(rows.length) });
  if (profitCol) {
    kpis.push({ label: `Total ${profitCol}`, value: fmtMoney(sumOf(profitCol)) });
    if (revenueCol && sumOf(revenueCol) !== 0) {
      kpis.push({ label: "Margin", value: ((sumOf(profitCol) / sumOf(revenueCol)) * 100).toFixed(1) + "%" });
    }
  }
  if (customerCol) kpis.push({ label: `Unique ${customerCol}`, value: fmtNum(columns.find((c) => c.name === customerCol)!.unique) });

  // --- Time series + growth --------------------------------------------------
  let trend: TimePoint[] = [];
  let trendLabel = "";
  if (dateCol && revenueCol) {
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const raw = (row[dateCol] ?? "").trim();
      const t = Date.parse(raw);
      if (Number.isNaN(t)) continue;
      const d = new Date(t);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const v = Number(row[revenueCol]);
      buckets.set(key, (buckets.get(key) ?? 0) + (Number.isNaN(v) ? 0 : v));
    }
    trend = [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ name: k, value: Math.round(v * 100) / 100 }));
    trendLabel = `${revenueCol} by month`;
    if (trend.length >= 2) {
      const firstPoint = trend[0]!;
      const lastPoint = trend[trend.length - 1]!;
      if (firstPoint.value !== 0) {
        const growth = ((lastPoint.value - firstPoint.value) / firstPoint.value) * 100;
        kpis.push({
          label: "Growth Rate",
          value: (growth >= 0 ? "+" : "") + growth.toFixed(1) + "%",
          detail: `${firstPoint.name} → ${lastPoint.name}`,
        });
      }
    }
  }

  // --- Categorical breakdowns -------------------------------------------------
  const catCols = columns.filter(
    (c) => c.type === "string" && c.unique >= 2 && c.unique <= Math.min(30, rows.length * 0.8),
  );
  const preferred = (re: RegExp) => catCols.find((c) => re.test(c.name));
  const barCol =
    preferred(/region|market|territory/i) ?? preferred(/category|type|department/i) ?? catCols[0];
  const donutCol =
    catCols.find((c) => c.name !== barCol?.name && /category|segment|type|product|region/i.test(c.name)) ??
    catCols.find((c) => c.name !== barCol?.name);

  const groupSum = (colName: string | undefined): ChartPoint[] => {
    if (!colName || !revenueCol) return [];
    const m = new Map<string, number>();
    for (const row of rows) {
      const k = (row[colName] ?? "").trim() || "(missing)";
      const v = Number(row[revenueCol]);
      m.set(k, (m.get(k) ?? 0) + (Number.isNaN(v) ? 0 : v));
    }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  };

  const bars = groupSum(barCol?.name);
  const barsLabel = barCol && revenueCol ? `${revenueCol} by ${barCol.name}` : "";
  const donut = groupSum(donutCol?.name);
  const donutLabel = donutCol && revenueCol ? `${revenueCol} share by ${donutCol.name}` : "";

  // --- Compact factual summary for the AI --------------------------------------
  const lines: string[] = [];
  lines.push(`Dataset "${name}": ${rows.length} rows, ${headers.length} columns.`);
  lines.push(`Columns: ${columns.map((c) => `${c.name} (${c.type}${c.missing ? `, ${c.missing} missing` : ""})`).join("; ")}.`);
  lines.push(`Duplicate rows: ${duplicateRows}. Total missing cells: ${totalMissing}.`);
  for (const n of numericCols) {
    lines.push(`Sum of ${n}: ${Math.round(sumOf(n) * 100) / 100}; average per row: ${Math.round((sumOf(n) / rows.length) * 100) / 100}.`);
  }
  if (trend.length >= 2) {
    lines.push(
      `Monthly ${revenueCol}: ${trend.map((t) => `${t.name}=${Math.round(t.value)}`).join(", ")}.`,
    );
  }
  if (bars.length) {
    lines.push(`${barsLabel}: ${bars.map((b) => `${b.name}=${Math.round(b.value)}`).join(", ")}.`);
  }
  if (donut.length && donutLabel !== barsLabel) {
    lines.push(`${donutLabel}: ${donut.map((d) => `${d.name}=${Math.round(d.value)}`).join(", ")}.`);
  }


  // --- Detailed pre-computed facts for the data-aware assistant ----------------
  const metricCols = [revenueCol, profitCol, qtyCol].filter(
    (c, i, arr): c is string => Boolean(c) && arr.indexOf(c) === i,
  );
  const discountCol = numericCols.find((n) => /discount|rebate/i.test(n));

  const monthKey = (raw: string): string | null => {
    const t = Date.parse((raw ?? "").trim());
    if (Number.isNaN(t)) return null;
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const sumBy = (keyOf: (r: Record<string, string>) => string | null, metric: string) => {
    const m = new Map<string, { sum: number; count: number }>();
    for (const row of rows) {
      const k = keyOf(row);
      if (k === null) continue;
      const v = Number(row[metric]);
      const cur = m.get(k) ?? { sum: 0, count: 0 };
      cur.sum += Number.isNaN(v) ? 0 : v;
      cur.count += 1;
      m.set(k, cur);
    }
    return m;
  };

  const round = (n: number) => Math.round(n * 100) / 100;
  const detail: string[] = [];
  detail.push(`DATASET: "${name}" — ${rows.length} rows, ${headers.length} columns.`);
  detail.push(
    `COLUMNS: ${columns.map((c) => `${c.name} (${c.type}, ${c.unique} distinct values${c.missing ? `, ${c.missing} missing` : ""})`).join("; ")}.`,
  );
  detail.push(`DATA QUALITY: ${duplicateRows} duplicate rows, ${totalMissing} missing cells.`);
  if (metricCols.length) {
    detail.push(
      `TOTALS: ${metricCols.map((mc) => `${mc} total=${round(sumOf(mc))}, average per row=${round(sumOf(mc) / rows.length)}`).join("; ")}.`,
    );
  }

  // Monthly series per metric, with month-over-month change.
  if (dateCol) {
    for (const mc of metricCols) {
      const monthly = [...sumBy((r) => monthKey(r[dateCol] ?? ""), mc).entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      );
      if (monthly.length < 2) continue;
      detail.push(
        `MONTHLY ${mc.toUpperCase()}: ${monthly.map(([k, v]) => `${k}=${round(v.sum)}`).join(", ")}.`,
      );
      const changes = monthly.slice(1).map(([k, v], i) => {
        const prev = monthly[i]![1].sum;
        const pct = prev === 0 ? null : ((v.sum - prev) / Math.abs(prev)) * 100;
        return `${k}: ${v.sum - prev >= 0 ? "+" : ""}${round(v.sum - prev)}${pct === null ? "" : ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`} vs ${monthly[i]![0]}`;
      });
      detail.push(`MONTH-OVER-MONTH CHANGE IN ${mc.toUpperCase()}: ${changes.join("; ")}.`);
      if (discountCol && mc === revenueCol) {
        const disc = [...sumBy((r) => monthKey(r[dateCol] ?? ""), discountCol).entries()].sort((a, b) =>
          a[0].localeCompare(b[0]),
        );
        detail.push(
          `AVERAGE ${discountCol} BY MONTH: ${disc.map(([k, v]) => `${k}=${round(v.sum / Math.max(1, v.count))}`).join(", ")}.`,
        );
      }
    }
  }

  // Every low-cardinality dimension broken down by every metric.
  for (const cat of catCols.slice(0, 6)) {
    for (const mc of metricCols) {
      const entries = [...sumBy((r) => (r[cat.name] ?? "").trim() || "(missing)", mc).entries()]
        .map(([k, v]) => ({ k, sum: round(v.sum), count: v.count }))
        .sort((a, b) => b.sum - a.sum)
        .slice(0, 20);
      if (!entries.length) continue;
      detail.push(
        `${mc.toUpperCase()} BY ${cat.name.toUpperCase()}: ${entries.map((e) => `${e.k}=${e.sum} (${e.count} records)`).join(", ")}.`,
      );
    }
  }

  // Dimension x month grid for the primary metric — lets the assistant explain dips.
  if (dateCol && revenueCol) {
    for (const cat of catCols.slice(0, 3)) {
      const grid = new Map<string, Map<string, number>>();
      for (const row of rows) {
        const mk = monthKey(row[dateCol] ?? "");
        if (!mk) continue;
        const k = (row[cat.name] ?? "").trim() || "(missing)";
        const v = Number(row[revenueCol]);
        const inner = grid.get(k) ?? new Map<string, number>();
        inner.set(mk, (inner.get(mk) ?? 0) + (Number.isNaN(v) ? 0 : v));
        grid.set(k, inner);
      }
      const lines2 = [...grid.entries()]
        .slice(0, 12)
        .map(
          ([k, inner]) =>
            `${k}: ${[...inner.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => `${m}=${round(v)}`).join(", ")}`,
        );
      if (lines2.length) {
        detail.push(`MONTHLY ${revenueCol.toUpperCase()} BY ${cat.name.toUpperCase()} —\n${lines2.join("\n")}`);
      }
    }
  }

  const analystContext = detail.join("\n");

  return {
    name,
    rowCount: rows.length,
    columnCount: headers.length,
    columns,
    duplicateRows,
    totalMissing,
    warnings,
    kpis: kpis.slice(0, 6),
    trend,
    trendLabel,
    bars,
    barsLabel,
    donut,
    donutLabel,
    summaryText: lines.join("\n"),
    analystContext,
  };
}
