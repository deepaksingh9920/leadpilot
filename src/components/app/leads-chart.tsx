"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart } from "lucide-react";

export function LeadsChart({ data }: { data: { date: string; count: number }[] }) {
  const total = data.reduce((sum, point) => sum + point.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-canvas/50 px-6 text-center">
        <LineChart className="size-6 text-line-strong" aria-hidden="true" />
        <p className="mt-2 text-sm font-semibold text-ink-soft">No lead activity yet</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
          This chart fills in as sourced leads are added. LeadPilot does not generate
          placeholder activity.
        </p>
      </div>
    );
  }

  const formatted = data.map((point) => ({
    ...point,
    label: new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formatted} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="lead-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4338ca" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#4338ca" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e5e1d8" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#5c6376" }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "#5c6376" }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e5e1d8",
              fontSize: 12,
              boxShadow: "0 12px 32px -12px rgba(17,19,34,0.2)",
            }}
            labelStyle={{ color: "#111322", fontWeight: 600 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            name="Leads"
            stroke="#4338ca"
            strokeWidth={2}
            fill="url(#lead-fill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
