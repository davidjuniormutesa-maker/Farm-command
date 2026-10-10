"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKwacha } from "@/lib/farm";
import { EmptyStateMessage } from "./empty-state";
import { ReportCard } from "./report-card";
import type { MonthPoint } from "./report-types";

const INCOME_FILL = "var(--chart-1)";
const EXPENSE_FILL = "var(--chart-3)";

/** Recorded income vs expenses per month over the last 6 months. */
export function FinanceChartReport({ months }: { months: MonthPoint[] }) {
  const hasData = months.some((m) => m.income > 0 || m.expense > 0);
  const totalIncome = months.reduce((s, m) => s + m.income, 0);
  const totalExpense = months.reduce((s, m) => s + m.expense, 0);
  const net = totalIncome - totalExpense;

  return (
    <ReportCard
      title="Income vs expenses"
      description="Recorded amounts per month, last 6 months"
    >
      {!hasData ? (
        <EmptyStateMessage message="No transactions recorded in the last 6 months — records will appear here as you use Farm Command." />
      ) : (
        <>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <YAxis
                  width={58}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickFormatter={(v: number) => formatKwacha(v, { compact: true })}
                />
                <Tooltip
                  cursor={{ fill: "var(--accent)", opacity: 0.5 }}
                  formatter={(value: number | string) => formatKwacha(Number(value))}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    color: "var(--popover-foreground)",
                  }}
                />
                <Legend
                  formatter={(value: string) => <span style={{ color: "var(--foreground)", fontSize: 12 }}>{value}</span>}
                />
                <Bar dataKey="income" name="Income" fill={INCOME_FILL} radius={[4, 4, 0, 0]} maxBarSize={38} />
                <Bar dataKey="expense" name="Expenses" fill={EXPENSE_FILL} radius={[4, 4, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Recorded net over 6 months:{" "}
            <span
              className={`font-semibold tabular-nums ${
                net > 0 ? "text-emerald-700 dark:text-emerald-400" : net < 0 ? "text-red-700 dark:text-red-400" : ""
              }`}
            >
              {formatKwacha(net)}
            </span>
            <span className="mt-0.5 block text-xs">Recorded entries only — not a full profit statement.</span>
          </p>
        </>
      )}
    </ReportCard>
  );
}
