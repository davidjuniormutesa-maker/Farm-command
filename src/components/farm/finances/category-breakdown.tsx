"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatKwacha } from "@/lib/farm";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { CategoryTotal } from "./finance-types";

function CategoryBars({
  title,
  rows,
  barClass,
  icon: Icon,
  iconClass,
  emptyText,
}: {
  title: string;
  rows: CategoryTotal[];
  barClass: string;
  icon: typeof ArrowUpRight;
  iconClass: string;
  emptyText: string;
}) {
  const top = rows.slice(0, 5);
  const max = top.length > 0 ? Math.max(...top.map((r) => r.total)) : 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`flex size-6 items-center justify-center rounded-md ${iconClass}`}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {top.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {top.map((r) => (
            <li key={r.category}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm">{r.category}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                  {formatKwacha(r.total)}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${barClass}`}
                  style={{ width: `${max > 0 ? Math.max((r.total / max) * 100, 4) : 0}%` }}
                  role="presentation"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Two lightweight CSS bar lists: top income + top expense categories. */
export function CategoryBreakdown({
  incomeByCategory,
  expenseByCategory,
  isLoading,
}: {
  incomeByCategory: CategoryTotal[];
  expenseByCategory: CategoryTotal[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Where money came from and went</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-5 w-32" />
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-8 w-full" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <CategoryBars
              title="Top income"
              rows={incomeByCategory}
              barClass="bg-primary"
              icon={ArrowDownLeft}
              iconClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
              emptyText="No recorded income in this period yet."
            />
            <CategoryBars
              title="Top expenses"
              rows={expenseByCategory}
              barClass="bg-gold"
              icon={ArrowUpRight}
              iconClass="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
              emptyText="No recorded expenses in this period yet."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
