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
  records: Record<string, string>[]; // cleaned raw rows retained for dynamic assistant calculations
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

function cleanValue(value: unknown): string {
  return (value ?? "").toString().trim();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_/-]+/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeToken(token: string): string {
  if (token.endsWith("movies")) return token.slice(0, -1);
  if (token.endsWith("ies") && token.length > 4) return token.slice(0, -3) + "y";
  if (token.endsWith("ses") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function normalizeForMatch(value: string): string {
  return normalizeText(value)
    .split(" ")
    .map(singularizeToken)
    .join(" ")
    .trim();
}

function includesPhrase(haystack: string, phrase: string): boolean {
  const h = ` ${normalizeForMatch(haystack)} `;
  const p = normalizeForMatch(phrase);
  return p.length > 0 && h.includes(` ${p} `);
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[$,%]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseFirstNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function fmtAnswerNumber(n: number, maximumFractionDigits = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits });
}

function fmtPercent(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
}

function splitCellValues(value: string, columnName: string): string[] {
  const raw = cleanValue(value);
  if (!raw) return [];
  if (/country|countries|category|genre|listed|cast|director|tag|segment/i.test(columnName) || raw.includes(",")) {
    return raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [raw];
}

function columnByName(columns: ColumnProfile[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const found = columns.find((c) => pattern.test(c.name));
    if (found) return found.name;
  }
  return null;
}

interface QuestionFilter {
  column: string;
  value: string;
  label: string;
}

export interface CalculationResult {
  status: "answered" | "unavailable";
  answer: string;
  method: string;
  evidence: string[];
  validation: string;
  promptContext: string;
}

function makeCalculationResult(result: Omit<CalculationResult, "promptContext">): CalculationResult {
  const promptContext = [
    `STATUS: ${result.status}`,
    `DIRECT ANSWER: ${result.answer}`,
    `CALCULATION METHOD: ${result.method}`,
    `VALIDATION: ${result.validation}`,
    `EVIDENCE: ${result.evidence.join(" | ")}`,
  ].join("\n");
  return { ...result, promptContext };
}

function isMovieFilter(filters: QuestionFilter[], question: string): boolean {
  return filters.some((f) => normalizeForMatch(f.value) === "movie") || includesPhrase(question, "movie");
}

function isTvShowFilter(filters: QuestionFilter[], question: string): boolean {
  return filters.some((f) => normalizeForMatch(f.value) === "tv show") || includesPhrase(question, "tv show");
}

function detectFilters(question: string, dataset: DatasetProfile): QuestionFilter[] {
  const filters: QuestionFilter[] = [];
  const questionMatch = normalizeForMatch(question);
  const stringColumns = dataset.columns.filter((c) => c.type === "string" && c.unique <= Math.max(80, dataset.rowCount * 0.6));

  for (const column of stringColumns) {
    const values = new Map<string, string>();
    for (const row of dataset.records) {
      for (const part of splitCellValues(row[column.name] ?? "", column.name)) {
        const key = normalizeForMatch(part);
        if (key.length >= 3 && !values.has(key)) values.set(key, part);
      }
    }
    for (const [key, label] of values) {
      if (questionMatch.includes(` ${key} `) || questionMatch === key || questionMatch.endsWith(` ${key}`) || questionMatch.startsWith(`${key} `)) {
        if (!filters.some((f) => f.column === column.name && normalizeForMatch(f.value) === key)) {
          filters.push({ column: column.name, value: label, label: `${column.name} = ${label}` });
        }
      }
    }
  }

  return filters;
}

function applyFilters(rows: Record<string, string>[], filters: QuestionFilter[]): Record<string, string>[] {
  if (!filters.length) return rows;
  return rows.filter((row) =>
    filters.every((filter) => {
      const wanted = normalizeForMatch(filter.value);
      return splitCellValues(row[filter.column] ?? "", filter.column).some((part) => normalizeForMatch(part) === wanted);
    }),
  );
}

function describeRows(filters: QuestionFilter[], fallback = "records"): string {
  const typeFilter = filters.find((f) => /type|kind|category/i.test(f.column));
  if (!typeFilter) return fallback;
  const normalized = normalizeForMatch(typeFilter.value);
  if (normalized === "movie") return "movies";
  if (normalized === "tv show") return "TV shows";
  return `${typeFilter.value} records`;
}

function detectDimension(question: string, dataset: DatasetProfile): string | null {
  const q = normalizeForMatch(question);
  const direct = dataset.columns.find((c) => includesPhrase(q, c.name));
  if (direct) return direct.name;

  const candidates: Array<{ terms: string[]; patterns: RegExp[] }> = [
    { terms: ["release year", "year", "releases", "released"], patterns: [/^release[_\s-]?year$/i, /year/i] },
    { terms: ["country", "countries", "nation"], patterns: [/country|countries|nation/i] },
    { terms: ["region", "market", "territory"], patterns: [/region|market|territory/i] },
    { terms: ["category", "genre", "listed in"], patterns: [/category|genre|listed/i] },
    { terms: ["product", "item", "title"], patterns: [/product|item|title/i] },
    { terms: ["segment"], patterns: [/segment/i] },
    { terms: ["rating"], patterns: [/rating/i] },
    { terms: ["type", "content type"], patterns: [/type|kind/i] },
  ];

  for (const candidate of candidates) {
    if (candidate.terms.some((term) => includesPhrase(q, term))) {
      const found = columnByName(dataset.columns, candidate.patterns);
      if (found) return found;
    }
  }

  return null;
}

function detectMetricColumn(question: string, dataset: DatasetProfile): { column: string; unit: string } | null {
  const direct = dataset.columns.find((c) => c.type === "number" && includesPhrase(question, c.name));
  if (direct) return { column: direct.name, unit: "" };

  const duration = columnByName(dataset.columns, [/duration|runtime|length|minutes|mins|season/i]);
  if (duration && ["duration", "runtime", "length", "minute", "minutes", "season", "seasons"].some((t) => includesPhrase(question, t))) {
    return { column: duration, unit: includesPhrase(question, "season") ? "seasons" : "minutes" };
  }

  const metricPatterns: Array<{ terms: string[]; patterns: RegExp[]; unit: string }> = [
    { terms: ["revenue", "sales", "amount", "income"], patterns: [/revenue|sales|amount|income|total/i], unit: "" },
    { terms: ["profit", "margin", "earnings"], patterns: [/profit|margin|earnings/i], unit: "" },
    { terms: ["quantity", "units", "orders", "volume"], patterns: [/quantity|qty|units|orders|volume|count/i], unit: "" },
  ];

  for (const metric of metricPatterns) {
    if (metric.terms.some((term) => includesPhrase(question, term))) {
      const found = columnByName(dataset.columns.filter((c) => c.type === "number"), metric.patterns);
      if (found) return { column: found, unit: metric.unit };
    }
  }

  return null;
}

function numericValues(rows: Record<string, string>[], column: string, question: string, filters: QuestionFilter[]) {
  const values: number[] = [];
  const movieOnly = isMovieFilter(filters, question);
  const tvOnly = isTvShowFilter(filters, question);
  const durationLike = /duration|runtime|length/i.test(column);

  for (const row of rows) {
    const raw = cleanValue(row[column]);
    if (!raw) continue;
    let value: number | null = parseNumber(raw);
    if (value === null && durationLike) {
      if (movieOnly) value = /\bmin\b|minute/i.test(raw) ? parseFirstNumber(raw) : null;
      else if (tvOnly) value = /season/i.test(raw) ? parseFirstNumber(raw) : null;
      else value = parseFirstNumber(raw);
    } else if (value === null) {
      value = parseFirstNumber(raw);
    }
    if (value !== null) values.push(value);
  }
  return values;
}

function unavailable(answer: string, method: string, evidence: string[]): CalculationResult {
  return makeCalculationResult({
    status: "unavailable",
    answer,
    method,
    evidence,
    validation: "The required column or usable values were not found in the uploaded dataset.",
  });
}

export function calculateDatasetAnswer(question: string, dataset: DatasetProfile): CalculationResult | null {
  const q = normalizeForMatch(question);
  const rows = dataset.records ?? [];
  if (!question.trim() || rows.length === 0) return null;

  const filters = detectFilters(question, dataset);
  const filteredRows = applyFilters(rows, filters);
  const filterText = filters.length ? filters.map((f) => f.label).join(", ") : "no filters";
  const asksAverage = /\b(avg|average|mean)\b/i.test(q);
  const asksPercentage = /\b(percent|percentage|share|proportion)\b/i.test(q);
  const asksCount = /\b(how many|count|number of|total records|total rows)\b/i.test(q);
  const asksSum = /\b(sum|total|generated)\b/i.test(q) && !asksCount && !asksPercentage;
  const asksRank = /\b(which|what)\b/i.test(q) && /\b(most|highest|top|best|least|lowest|fewest|worst)\b/i.test(q);
  const asksMinimum = /\b(min|minimum|smallest|lowest)\b/i.test(q) && !asksRank;
  const asksMaximum = /\b(max|maximum|largest|highest)\b/i.test(q) && !asksRank;
  const wantsLow = /\b(least|lowest|fewest|worst)\b/i.test(q);

  if (asksPercentage) {
    if (!filters.length) {
      return unavailable(
        "I could not calculate that percentage because the question does not identify a category or value to count.",
        "Tried to calculate a percentage, but no matching filter value was found in the dataset.",
        [`Available columns: ${dataset.columns.map((c) => c.name).join(", ")}`],
      );
    }
    const numerator = filteredRows.length;
    const denominator = rows.length;
    const pct = denominator === 0 ? 0 : (numerator / denominator) * 100;
    const subject = describeRows(filters, "matching records");
    return makeCalculationResult({
      status: "answered",
      answer: `${fmtPercent(pct)} of the catalog is ${subject}.`,
      method: `Filtered the dataset by ${filterText}, counted ${numerator} matching rows, then divided by ${denominator} total rows.`,
      evidence: [`Matching rows: ${numerator}`, `Total rows: ${denominator}`, `Percentage: ${fmtPercent(pct)}`],
      validation: "The percentage was calculated from row counts in the uploaded dataset.",
    });
  }

  if (asksAverage) {
    const metric = detectMetricColumn(question, dataset);
    if (!metric) {
      return unavailable(
        "I could not calculate the average because I could not find the requested numeric column.",
        "Looked for a numeric or duration-like column mentioned in the question.",
        [`Available columns: ${dataset.columns.map((c) => `${c.name} (${c.type})`).join(", ")}`],
      );
    }
    const values = numericValues(filteredRows, metric.column, question, filters);
    if (!values.length) {
      return unavailable(
        `I could not calculate the average ${metric.column} because there are no usable numeric values after applying the filters.`,
        `Filtered by ${filterText}, then tried to extract numeric values from ${metric.column}.`,
        [`Rows after filter: ${filteredRows.length}`, `Usable numeric values: 0`],
      );
    }
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const unit = metric.unit ? ` ${metric.unit}` : "";
    const subject = filters.length ? ` for ${describeRows(filters, "matching records")}` : "";
    return makeCalculationResult({
      status: "answered",
      answer: `The average ${metric.column}${subject} is ${fmtAnswerNumber(avg)}${unit}.`,
      method: `Filtered by ${filterText}, extracted ${values.length} usable numeric value${values.length === 1 ? "" : "s"} from ${metric.column}, ignored missing or non-matching values, then calculated the mean.`,
      evidence: [`Rows after filter: ${filteredRows.length}`, `Values used: ${values.length}`, `Average: ${fmtAnswerNumber(avg)}${unit}`],
      validation: "Only values from the requested column and matching rows were used.",
    });
  }

  if (asksMinimum || asksMaximum) {
    const metric = detectMetricColumn(question, dataset);
    if (!metric) {
      return unavailable(
        `I could not calculate the ${asksMinimum ? "minimum" : "maximum"} because I could not find the requested numeric column.`,
        "Looked for a numeric or duration-like column mentioned in the question.",
        [`Available columns: ${dataset.columns.map((c) => `${c.name} (${c.type})`).join(", ")}`],
      );
    }
    const values = numericValues(filteredRows, metric.column, question, filters);
    if (!values.length) {
      return unavailable(
        `I could not calculate the ${asksMinimum ? "minimum" : "maximum"} ${metric.column} because there are no usable numeric values after applying the filters.`,
        `Filtered by ${filterText}, then tried to extract numeric values from ${metric.column}.`,
        [`Rows after filter: ${filteredRows.length}`, "Usable numeric values: 0"],
      );
    }
    const value = asksMinimum ? Math.min(...values) : Math.max(...values);
    const unit = metric.unit ? ` ${metric.unit}` : "";
    return makeCalculationResult({
      status: "answered",
      answer: `The ${asksMinimum ? "minimum" : "maximum"} ${metric.column} is ${fmtAnswerNumber(value)}${unit}.`,
      method: `Filtered by ${filterText}, extracted ${values.length} usable values from ${metric.column}, then selected the ${asksMinimum ? "smallest" : "largest"} value.`,
      evidence: [`Rows after filter: ${filteredRows.length}`, `Values compared: ${values.length}`, `Result: ${fmtAnswerNumber(value)}${unit}`],
      validation: "Only usable values from the requested column and matching rows were compared.",
    });
  }

  if (asksRank) {
    const dimension = detectDimension(question, dataset);
    if (!dimension) {
      return unavailable(
        "I could not rank the dataset because I could not identify the grouping column in the question.",
        "Looked for a requested dimension such as year, country, region, category, product, segment, rating, or type.",
        [`Available columns: ${dataset.columns.map((c) => c.name).join(", ")}`],
      );
    }
    const metric = detectMetricColumn(question, dataset);
    const groups = new Map<string, number>();
    for (const row of filteredRows) {
      const keys = splitCellValues(row[dimension] ?? "", dimension);
      if (!keys.length) continue;
      const amount = metric ? numericValues([row], metric.column, question, filters)[0] : 1;
      const value = metric ? amount : 1;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      for (const key of keys) groups.set(key, (groups.get(key) ?? 0) + value);
    }
    const ranked = [...groups.entries()].sort((a, b) => (wantsLow ? a[1] - b[1] : b[1] - a[1]));
    const top = ranked[0];
    if (!top) {
      return unavailable(
        `I could not rank by ${dimension} because there are no usable grouped values after applying the filters.`,
        `Filtered by ${filterText}, then grouped by ${dimension}.`,
        [`Rows after filter: ${filteredRows.length}`, `Groups found: 0`],
      );
    }
    const [name, value] = top;
    const metricLabel = metric ? metric.column : describeRows(filters, "records");
    const valueLabel = metric ? fmtAnswerNumber(value) : `${fmtAnswerNumber(value, 0)} ${metricLabel}`;
    return makeCalculationResult({
      status: "answered",
      answer: `${name} had the ${wantsLow ? "lowest" : "highest"} ${metric ? metric.column : "count"}, with ${valueLabel}.`,
      method: `Filtered by ${filterText}, grouped the matching rows by ${dimension}, ${metric ? `summed ${metric.column}` : "counted rows"} for each group, then sorted the groups ${wantsLow ? "ascending" : "descending"}.`,
      evidence: [`Rows after filter: ${filteredRows.length}`, `Groups compared: ${ranked.length}`, `Top result: ${name} = ${valueLabel}`],
      validation: "The ranking was calculated from the uploaded dataset rows, not from predefined facts.",
    });
  }

  if (asksCount) {
    const subject = filters.length ? describeRows(filters, "matching records") : "records";
    return makeCalculationResult({
      status: "answered",
      answer: `There are ${fmtAnswerNumber(filteredRows.length, 0)} ${subject}.`,
      method: `Applied ${filterText}, then counted the matching rows.`,
      evidence: [`Matching rows: ${filteredRows.length}`, `Total rows: ${rows.length}`],
      validation: "The count was calculated directly from the uploaded dataset rows.",
    });
  }

  if (asksSum) {
    const metric = detectMetricColumn(question, dataset);
    if (!metric) return null;
    const values = numericValues(filteredRows, metric.column, question, filters);
    if (!values.length) {
      return unavailable(
        `I could not calculate the total ${metric.column} because there are no usable numeric values after applying the filters.`,
        `Filtered by ${filterText}, then tried to sum ${metric.column}.`,
        [`Rows after filter: ${filteredRows.length}`, `Usable numeric values: 0`],
      );
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    return makeCalculationResult({
      status: "answered",
      answer: `The total ${metric.column} is ${fmtAnswerNumber(total)}${metric.unit ? ` ${metric.unit}` : ""}.`,
      method: `Filtered by ${filterText}, extracted ${values.length} usable numeric value${values.length === 1 ? "" : "s"}, then summed ${metric.column}.`,
      evidence: [`Rows after filter: ${filteredRows.length}`, `Values used: ${values.length}`, `Total: ${fmtAnswerNumber(total)}`],
      validation: "The total was calculated directly from the uploaded dataset rows.",
    });
  }

  return null;
}

export function profileCsv(csvText: string, name = "Uploaded dataset"): DatasetProfile {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data.map((row) => {
    const cleaned: Record<string, string> = {};
    for (const header of headers) cleaned[header] = cleanValue(row[header]);
    return cleaned;
  });
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
      const raw = cleanValue(row[h]);
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
  const customerProfile = customerCol ? columns.find((c) => c.name === customerCol) : undefined;
  if (customerCol && customerProfile) kpis.push({ label: `Unique ${customerCol}`, value: fmtNum(customerProfile.unique) });

  // --- Time series + growth --------------------------------------------------
  let trend: TimePoint[] = [];
  let trendLabel = "";
  if (dateCol && revenueCol) {
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const raw = cleanValue(row[dateCol]);
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
      const firstPoint = trend[0];
      const lastPoint = trend[trend.length - 1];
      if (firstPoint && lastPoint && firstPoint.value !== 0) {
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
      const k = cleanValue(row[colName]) || "(missing)";
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
  const r2 = (n: number) => Math.round(n * 100) / 100;

  /** Values of a numeric column that are usable numbers. */
  const numericValues = (col: string): number[] => {
    const out: number[] = [];
    for (const row of rows) {
      const v = Number(cleanValue(row[col]));
      if (cleanValue(row[col]) !== "" && !Number.isNaN(v)) out.push(v);
    }
    return out;
  };

  /**
   * Year-like / identifier-like numeric columns must never be summed — a "sum of
   * release years" is meaningless. They are described with counts and ranges.
   */
  const isYearLike = (col: string): boolean => {
    if (/year/i.test(col)) return true;
    const vals = numericValues(col);
    if (!vals.length) return false;
    return vals.every((v) => Number.isInteger(v) && v >= 1800 && v <= 2200);
  };
  const isIdLike = (col: string): boolean =>
    /(^|[_\s-])(id|code|zip|postal|phone)([_\s-]|$)/i.test(col) ||
    columns.find((c) => c.name === col)?.unique === rows.length;

  const lines: string[] = [];
  lines.push(`Dataset "${name}": ${rows.length} rows, ${headers.length} columns.`);
  lines.push(`Columns: ${columns.map((c) => `${c.name} (${c.type}${c.missing ? `, ${c.missing} missing` : ""})`).join("; ")}.`);
  lines.push(
    `Data completeness: ${duplicateRows} duplicate rows (${r2((duplicateRows / Math.max(1, rows.length)) * 100)}% of rows), ${totalMissing} missing cells (${r2((totalMissing / Math.max(1, rows.length * Math.max(1, headers.length))) * 100)}% of all cells).`,
  );

  for (const n of numericCols) {
    const vals = numericValues(n);
    if (!vals.length) continue;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sorted = [...vals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? avg;
    if (isYearLike(n) || isIdLike(n)) {
      // Counts per value (top years / most frequent values) — never a sum.
      const counts = new Map<number, number>();
      for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      lines.push(
        `${n} (year/identifier column — do NOT sum it): ranges from ${min} to ${max}; ${counts.size} distinct values; most frequent: ${top
          .map(([v, c]) => `${v} with ${c} records (${r2((c / vals.length) * 100)}% of records)`)
          .join(", ")}.`,
      );
    } else {
      lines.push(
        `${n}: total ${r2(vals.reduce((s, v) => s + v, 0))}; average ${r2(avg)}; median ${r2(median)}; lowest ${r2(min)}; highest ${r2(max)}; ${vals.length} of ${rows.length} records have a value.`,
      );
    }
  }

  // Category breakdowns as counts + share of records (easy to read, no jargon).
  for (const c of catCols.slice(0, 4)) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const k = cleanValue(row[c.name]) || "(missing)";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    lines.push(
      `Records by ${c.name}: ${top
        .map(([k, n]) => `${k} = ${n} records (${r2((n / rows.length) * 100)}%)`)
        .join(", ")}${counts.size > top.length ? `, plus ${counts.size - top.length} other values` : ""}.`,
    );
  }

  if (trend.length >= 2) {
    const firstPoint = trend[0]!;
    const lastPoint = trend[trend.length - 1]!;
    const change =
      firstPoint.value === 0 ? null : ((lastPoint.value - firstPoint.value) / Math.abs(firstPoint.value)) * 100;
    lines.push(
      `Monthly ${revenueCol}: ${trend.map((t) => `${t.name}=${Math.round(t.value)}`).join(", ")}.`,
    );
    lines.push(
      `Trend for ${revenueCol}: ${firstPoint.name} = ${Math.round(firstPoint.value)} vs ${lastPoint.name} = ${Math.round(lastPoint.value)}${
        change === null ? "" : ` (${change >= 0 ? "up" : "down"} ${r2(Math.abs(change))}%)`
      }.`,
    );
  }
  if (bars.length) {
    const totalBars = bars.reduce((s, b) => s + b.value, 0);
    lines.push(
      `${barsLabel}: ${bars
        .map((b) => `${b.name}=${Math.round(b.value)}${totalBars ? ` (${r2((b.value / totalBars) * 100)}% of total)` : ""}`)
        .join(", ")}.`,
    );
  }
  if (donut.length && donutLabel !== barsLabel) {
    const totalDonut = donut.reduce((s, d) => s + d.value, 0);
    lines.push(
      `${donutLabel}: ${donut
        .map((d) => `${d.name}=${Math.round(d.value)}${totalDonut ? ` (${r2((d.value / totalDonut) * 100)}%)` : ""}`)
        .join(", ")}.`,
    );
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
        const previous = monthly[i];
        if (!previous) return `${k}: ${round(v.sum)}`;
        const prev = previous[1].sum;
        const pct = prev === 0 ? null : ((v.sum - prev) / Math.abs(prev)) * 100;
        return `${k}: ${v.sum - prev >= 0 ? "+" : ""}${round(v.sum - prev)}${pct === null ? "" : ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`} vs ${previous[0]}`;
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
      const entries = [...sumBy((r) => cleanValue(r[cat.name]) || "(missing)", mc).entries()]
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
        const k = cleanValue(row[cat.name]) || "(missing)";
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
    records: rows,
    summaryText: lines.join("\n"),
    analystContext,
  };
}
