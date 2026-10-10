"use client";

import { titleCase } from "@/lib/farm";
import { EmptyStateMessage } from "./empty-state";
import { ReportCard } from "./report-card";
import type { SpeciesCount } from "./report-types";

/** Livestock summary — species counts as horizontal bars + herd totals. */
export function LivestockReport({
  bySpecies,
  totalActive,
  groupsCount,
  recentDeaths,
}: {
  bySpecies: SpeciesCount[];
  totalActive: number;
  groupsCount: number;
  recentDeaths: number;
}) {
  const max = bySpecies.length > 0 ? Math.max(...bySpecies.map((s) => s.count)) : 0;

  return (
    <ReportCard
      title="Livestock summary"
      description="Active animals currently on the farm"
    >
      {bySpecies.length === 0 ? (
        <EmptyStateMessage message="No active animals yet — records will appear here as you use Farm Command." />
      ) : (
        <>
          <ul className="space-y-2.5">
            {bySpecies.map((s) => (
              <li key={s.species}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm">{titleCase(s.species)}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
                    {s.count} {s.count === 1 ? "animal" : "animals"}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${max > 0 ? Math.max((s.count / max) * 100, 5) : 0}%` }}
                    role="presentation"
                  />
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center">
            <div>
              <dt className="text-[11px] text-muted-foreground">Total active</dt>
              <dd className="text-lg font-semibold tabular-nums">{totalActive}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Groups / herds</dt>
              <dd className="text-lg font-semibold tabular-nums">{groupsCount}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Deaths (30 days)</dt>
              <dd className={`text-lg font-semibold tabular-nums ${recentDeaths > 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                {recentDeaths}
              </dd>
            </div>
          </dl>
        </>
      )}
    </ReportCard>
  );
}
