/**
 * Deterministic sample business dataset (Northwind-style sales).
 * A seeded PRNG keeps the dataset identical on every load so the
 * dashboard metrics are reproducible.
 */

export interface SampleRow {
  Date: string;
  Region: string;
  Product: string;
  Category: string;
  "Customer Segment": string;
  Sales: number;
  Quantity: number;
  Profit: number;
  Discount: number;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = ["North", "South", "East", "West", "Central"] as const;
const SEGMENTS = ["Enterprise", "SMB", "Consumer"] as const;

const PRODUCTS: Array<{ name: string; category: string; basePrice: number; margin: number }> = [
  { name: "Analytics Pro License", category: "Software", basePrice: 2400, margin: 0.72 },
  { name: "Reporting Suite License", category: "Software", basePrice: 1600, margin: 0.68 },
  { name: "Data Connector Add-on", category: "Software", basePrice: 700, margin: 0.8 },
  { name: "Implementation Service", category: "Services", basePrice: 3200, margin: 0.38 },
  { name: "Training Workshop", category: "Services", basePrice: 1400, margin: 0.45 },
  { name: "Support Contract", category: "Services", basePrice: 950, margin: 0.55 },
  { name: "Edge Gateway Device", category: "Hardware", basePrice: 1150, margin: 0.22 },
  { name: "Sensor Bundle", category: "Hardware", basePrice: 480, margin: 0.18 },
];

/** Region performance multipliers per quarter — South deteriorates over the year. */
const REGION_TREND: Record<string, number[]> = {
  North: [1.0, 1.05, 1.08, 1.12],
  South: [1.05, 0.95, 0.82, 0.68],
  East: [0.95, 1.0, 1.04, 1.06],
  West: [1.02, 1.03, 1.05, 1.09],
  Central: [0.9, 0.92, 0.93, 0.95],
};

/** Category growth — Software accelerates, Hardware softens. */
const CATEGORY_TREND: Record<string, number[]> = {
  Software: [0.9, 1.0, 1.12, 1.25],
  Services: [1.0, 1.02, 1.03, 1.05],
  Hardware: [1.05, 1.0, 0.92, 0.85],
};

export function generateSampleDataset(): SampleRow[] {
  const rand = mulberry32(20260825);
  const rows: SampleRow[] = [];
  const start = new Date(2025, 0, 1);

  for (let day = 0; day < 365; day++) {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    const quarter = Math.floor(day / 91.25);
    const dateStr = date.toISOString().slice(0, 10);
    const ordersToday = 1 + Math.floor(rand() * 3);

    for (let o = 0; o < ordersToday; o++) {
      const region = REGIONS[Math.floor(rand() * REGIONS.length)]!;
      const product = PRODUCTS[Math.floor(rand() * PRODUCTS.length)]!;
      const segment = SEGMENTS[Math.floor(rand() * SEGMENTS.length)]!;

      const regionMult = REGION_TREND[region]![quarter]!;
      const catMult = CATEGORY_TREND[product.category]![quarter]!;
      const weekdayMult = date.getDay() === 0 || date.getDay() === 6 ? 0.55 : 1;
      const noise = 0.7 + rand() * 0.6;

      const quantity = 1 + Math.floor(rand() * 8);
      const discount = Math.round(rand() * 25) / 100;
      const sales =
        Math.round(product.basePrice * quantity * (1 - discount) * regionMult * catMult * weekdayMult * noise * 100) / 100;
      const profit = Math.round(sales * product.margin * (0.8 + rand() * 0.4) * 100) / 100;

      rows.push({
        Date: dateStr,
        Region: region,
        Product: product.name,
        Category: product.category,
        "Customer Segment": segment,
        Sales: sales,
        Quantity: quantity,
        Profit: profit,
        Discount: discount,
      });
    }
  }

  // Inject realistic data-quality issues: duplicate rows and missing segments.
  for (let i = 0; i < 7; i++) {
    rows.push({ ...rows[10 + i * 37]! });
  }
  for (let i = 0; i < 23; i++) {
    rows[(i * 41 + 5) % rows.length]!["Customer Segment"] = "";
  }
  return rows;
}

export function sampleDatasetToCsv(rows: SampleRow[]): string {
  const header = "Date,Region,Product,Category,Customer Segment,Sales,Quantity,Profit,Discount";
  const lines = rows.map((r) =>
    [r.Date, r.Region, r.Product, r.Category, r["Customer Segment"], r.Sales, r.Quantity, r.Profit, r.Discount].join(","),
  );
  return [header, ...lines].join("\n");
}
