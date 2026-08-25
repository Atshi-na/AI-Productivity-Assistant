import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint, TimePoint } from "@/lib/data-analysis";

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "0.5rem",
  fontSize: "0.75rem",
  color: "var(--color-foreground)",
};

const axisStyle = { fontSize: 11, fill: "var(--color-muted-foreground)" };

export function TrendChart({ data }: { data: TimePoint[] }) {
  const mounted = useMounted();
  if (!mounted) return <div className="h-64 animate-pulse rounded-md bg-muted" />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis
            tick={axisStyle}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(v))}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-chart-1)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--color-chart-1)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data }: { data: ChartPoint[] }) {
  const mounted = useMounted();
  if (!mounted) return <div className="h-64 animate-pulse rounded-md bg-muted" />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis
            tick={axisStyle}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(v))}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data }: { data: ChartPoint[] }) {
  const mounted = useMounted();
  if (!mounted) return <div className="h-64 animate-pulse rounded-md bg-muted" />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex h-64 w-full flex-col">
      <ResponsiveContainer width="100%" height="75%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.slice(0, 6).map((d, i) => (
          <li key={d.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            {d.name} ({total ? Math.round((d.value / total) * 100) : 0}%)
          </li>
        ))}
      </ul>
    </div>
  );
}
