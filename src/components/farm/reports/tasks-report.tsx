"use client";

import { titleCase } from "@/lib/farm";
import { EmptyStateMessage } from "./empty-state";
import { ReportCard, StatTile } from "./report-card";
import type { TypeCount } from "./report-types";

/** Tasks completed vs overdue + open work by category. */
export function TasksReport({
  completed30,
  overdue,
  openTotal,
  byCategory,
}: {
  completed30: number;
  overdue: number;
  openTotal: number;
  byCategory: { category: string; count: number }[];
}) {
  return (
    <ReportCard title="Tasks" description="How the to-do list is flowing">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Completed (30 days)" value={completed30} tone="good" />
        <StatTile label="Overdue now" value={overdue} tone={overdue > 0 ? "bad" : "good"} />
        <StatTile label="Open in total" value={openTotal} />
      </div>
      {byCategory.length === 0 ? (
        <div className="mt-3">
          <EmptyStateMessage message="No open tasks — records will appear here as you use Farm Command." />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {byCategory.map((c) => (
            <span
              key={c.category}
              className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
            >
              {titleCase(c.category)} · {c.count}
            </span>
          ))}
        </div>
      )}
    </ReportCard>
  );
}
