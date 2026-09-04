"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InsightSeriesPoint } from "@/types/domain";

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

export function ScoreTrendChart({ data }: { data: InsightSeriesPoint[] }) {
  return (
    <div className="h-48 w-full" role="img" aria-label="Resume score by version chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--foreground-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[60, 100]} tick={{ fill: "var(--foreground-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "var(--accent)", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ReadinessChart({ data }: { data: InsightSeriesPoint[] }) {
  return (
    <div className="h-48 w-full" role="img" aria-label="Interview readiness trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="readinessFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cyan)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--cyan)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--foreground-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[40, 100]} tick={{ fill: "var(--foreground-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--cyan)"
            strokeWidth={2}
            fill="url(#readinessFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CoverageChart({ data }: { data: InsightSeriesPoint[] }) {
  return (
    <div className="h-48 w-full" role="img" aria-label="Evidence coverage by role chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--foreground-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: "var(--foreground-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="var(--accent)" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
