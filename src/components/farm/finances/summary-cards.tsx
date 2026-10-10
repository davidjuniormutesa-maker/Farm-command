"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatKwacha } from "@/lib/farm";
import { TrendingDown, TrendingUp, Scale } from "lucide-react";
import type { FinanceSummary } from "./finance-types";

function netTone(net: number): string {
  if (net > 0) return "text-emerald-700 dark:text-emerald-400";
  if (net < 0) return "text-red-700 dark:text-red-400";
  return "text-foreground";
}

/** Three "Recorded …" summary cards — deliberately never labelled as profit. */
export function SummaryCards({ summary, isLoading }: { summary?: FinanceSummary; isLoading: boolean }) {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 sm:p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-8 w-36" />
              <Skeleton className="mt-3 h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Recorded income",
      value: formatKwacha(summary.income),
      icon: TrendingUp,
      valueClass: "text-emerald-700 dark:text-emerald-400",
      iconClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
      detail: `${summary.incomeByCategory.length} categor${summary.incomeByCategory.length === 1 ? "y" : "ies"} recorded`,
    },
    {
      label: "Recorded expenses",
      value: formatKwacha(summary.expense),
      icon: TrendingDown,
      valueClass: "text-red-700 dark:text-red-400",
      iconClass: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
      detail: `${summary.expenseByCategory.length} categor${summary.expenseByCategory.length === 1 ? "y" : "ies"} recorded`,
    },
    {
      label: "Recorded net",
      value: formatKwacha(summary.net),
      icon: Scale,
      valueClass: netTone(summary.net),
      iconClass: "bg-muted text-muted-foreground",
      detail: `${summary.count} transaction${summary.count === 1 ? "" : "s"} in this period`,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">{c.label}</span>
              <span className={`flex size-9 items-center justify-center rounded-lg ${c.iconClass}`}>
                <c.icon className="size-4.5" aria-hidden />
              </span>
            </div>
            <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${c.valueClass}`}>{c.value}</p>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground sm:col-span-3">
        Recorded entries only — not a full profit statement. Farm Command reports what you have recorded, not
        everything your farm earned or owes.
      </p>
    </div>
  );
}
