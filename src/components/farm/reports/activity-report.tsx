"use client";

import { titleCase } from "@/lib/farm";
import { EmptyStateMessage } from "./empty-state";
import { ReportCard } from "./report-card";
import type { TypeCount } from "./report-types";

/** Compact activity history strip for the last 30 days. */
export function ActivityReport({ last30ByType }: { last30ByType: TypeCount[] }) {
  return (
    <ReportCard
      title="Farm activity (last 30 days)"
      description="Work logged across fields, crops and livestock"
      className="md:col-span-2"
    >
      {last30ByType.length === 0 ? (
        <EmptyStateMessage message="No activities logged in the last 30 days — records will appear here as you use Farm Command." />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {last30ByType.map((a) => (
            <span
              key={a.type}
              className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
            >
              {titleCase(a.type)} · <span className="font-semibold text-foreground">{a.count}</span>
            </span>
          ))}
        </div>
      )}
    </ReportCard>
  );
}
