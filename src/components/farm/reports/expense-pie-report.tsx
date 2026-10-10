"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatKwacha } from "@/lib/farm";
import { EmptyStateMessage } from "./empty-state";
import { ReportCard } from "./report-card";
import type { CatTotal } from "./report-types";

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Expense breakdown by category — donut chart + readable legend with values. */
export function ExpensePieReport({ rows }: { rows: CatTotal[] }) {
  const data = rows.slice(0, 8);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <ReportCard
      title="Expense breakdown"
      description={total > 0 ? `Recorded expenses by category · ${formatKwacha(total, { compact: true })} total` : undefined}
    >
      {data.length === 0 ? (
        <EmptyStateMessage message="No expenses recorded yet — records will appear here as you use Farm Command." />
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[200px_1fr]">
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Tooltip
                  formatter={(value: number | string, name: string) => [formatKwacha(Number(value)), name]}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Pie
                  data={data}
                  dataKey="total"
                  nameKey="category"
                  innerRadius={52}
                  outerRadius={88}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((entry, i) => (
                    <Cell key={entry.category} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2">
            {data.map((r, i) => (
              <li key={r.category} className="flex items-center gap-2 text-sm">
                <span
                  className="size-3 shrink-0 rounded-sm"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{r.category}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatKwacha(r.total)}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {total > 0 ? `${Math.round((r.total / total) * 100)}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ReportCard>
  );
}
