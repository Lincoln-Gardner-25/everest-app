"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BarChart3 } from "lucide-react";
import {
  formatCurrency,
  formatCurrencyFull,
  getProjectTypeColor,
  type TypeGroup,
} from "@/lib/reflect-utils";

interface IncomeWaterfallChartProps {
  byType: TypeGroup[];
}

export function IncomeWaterfallChart({ byType }: IncomeWaterfallChartProps) {
  if (byType.length === 0) return null;

  const data = byType.map(({ type, total }) => ({
    name: type,
    income: total,
  }));

  return (
    <div className="rounded-2xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10">
          <BarChart3 className="h-5 w-5 text-secondary" />
        </div>
        <div>
          <h3
            className="font-semibold text-foreground"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Income by Category
          </h3>
          <p className="text-xs text-muted-foreground">
            Where your money comes from
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={byType.length * 52 + 20}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
          <XAxis
            type="number"
            tickFormatter={(v) => formatCurrency(v)}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#9CA3AF" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 13, fill: "#1F2937" }}
          />
          <Tooltip
            formatter={(value) => [formatCurrencyFull(value as number), "Income"]}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              fontSize: "13px",
            }}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar dataKey="income" radius={[0, 6, 6, 0]} barSize={28}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={getProjectTypeColor(entry.name)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
        {byType.map(({ type }) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getProjectTypeColor(type) }}
            />
            <span className="text-xs text-muted-foreground">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
