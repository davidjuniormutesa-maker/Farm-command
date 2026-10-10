"use client";

/**
 * BreedingReport (r8-b, refactored r9) — the breeding & heat outlook for Reports.
 *
 * Derivation lives in breeding-derive.ts (shared with the Calendar markers so
 * the two views can never drift). This card is the print-friendly report view
 * of that data. Informational — no interactive controls by design.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { apiGet, qk } from "@/lib/api";
import { formatDateShort, type AnimalDTO, type HealthEventDTO } from "@/lib/farm";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateMessage } from "./empty-state";
import { ReportCard } from "./report-card";
import { deriveBreedingOutlook } from "./breeding-derive";

/** Window rows shown before the "+N more" line (display concern of this card). */
const MAX_WINDOW_ROWS = 8;

/** Days-remaining chip: overdue = red, ≤ 14 days = amber, later = muted. */
function dueChip(daysRemaining: number, overdue: boolean): { text: string; className: string } {
  if (overdue) {
    return {
      text: `${Math.abs(daysRemaining)}d overdue`,
      className:
        "border-red-300/70 bg-red-50/70 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
    };
  }
  if (daysRemaining <= 14) {
    return {
      text: `${daysRemaining}d left`,
      className:
        "border-amber-300/70 bg-amber-50/70 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
    };
  }
  return { text: `${daysRemaining}d left`, className: "text-muted-foreground" };
}

export function BreedingReport() {
  const animalsQuery = useQuery({
    queryKey: qk.animals,
    queryFn: () => apiGet<AnimalDTO[]>("/api/animals"),
  });
  const eventsQuery = useQuery({
    queryKey: qk.healthEvents,
    queryFn: () => apiGet<HealthEventDTO[]>("/api/health-events"),
  });

  const isLoading = animalsQuery.isLoading || eventsQuery.isLoading;
  const isError = animalsQuery.isError || eventsQuery.isError;

  const animals = animalsQuery.data ?? [];
  const events = eventsQuery.data ?? [];

  // Shared derivation (same numbers as the Calendar markers).
  const { births, windows } = useMemo(
    () => deriveBreedingOutlook(animals, events),
    [animals, events]
  );

  return (
    <ReportCard
      title="Breeding & heat outlook"
      description="Expected births and re-breeding windows from your breeding & birth records"
    >
      {isLoading ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-[58px] w-full rounded-lg" />
          <Skeleton className="h-[58px] w-full rounded-lg" />
          <Skeleton className="h-[58px] w-full rounded-lg" />
        </div>
      ) : isError ? (
        <EmptyStateMessage message="Breeding data could not be loaded right now — your records are safe on this device." />
      ) : births.length === 0 && windows.length === 0 ? (
        <EmptyStateMessage message="No open breeding cycles — log a breeding event from an animal's profile to build the outlook." />
      ) : (
        <>
          {/* ---------- Expected births ---------- */}
          <section aria-label="Expected births">
            <h3 className="text-sm font-semibold">Expected births</h3>
            {births.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No open gestations right now.</p>
            ) : (
              <ul className="farm-scroll mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {births.map((b) => {
                  const chip = dueChip(b.daysRemaining, b.overdue);
                  return (
                    <li
                      key={b.key}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{b.label}</p>
                        <p className="text-xs text-muted-foreground">
                          Bred {formatDateShort(b.bredOn)} · expected {formatDateShort(b.expectedOn)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{b.stage}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 tabular-nums ${chip.className}`}>
                        {chip.text}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------- Re-breeding (heat) windows ---------- */}
          <section aria-label="Re-breeding windows" className="mt-4 border-t pt-4">
            <h3 className="text-sm font-semibold">Re-breeding windows</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Heat window after the last birth — Cattle 60d · Goats &amp; Sheep 21d · Pigs 28d
            </p>
            {windows.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No recent births to time a re-breeding from.</p>
            ) : (
              <>
                <ul className="farm-scroll mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {windows.slice(0, MAX_WINDOW_ROWS).map((w) => (
                    <li
                      key={w.key}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{w.label}</p>
                        <p className="text-xs text-muted-foreground">
                          Birth {formatDateShort(w.birthOn)} · window opens {formatDateShort(w.opensOn)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          w.openNow
                            ? "shrink-0 border-emerald-300/70 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "shrink-0 text-muted-foreground"
                        }
                      >
                        {w.openNow ? "Open now" : `in ${w.daysUntilOpen} ${w.daysUntilOpen === 1 ? "day" : "days"}`}
                      </Badge>
                    </li>
                  ))}
                </ul>
                {windows.length > MAX_WINDOW_ROWS && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    +{windows.length - MAX_WINDOW_ROWS} more
                  </p>
                )}
              </>
            )}
          </section>

          {/* ---------- Honesty note (required) ---------- */}
          <p
            className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
            role="note"
          >
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              General guidance — cycles vary by breed, season and body condition; confirm with your
              veterinarian or extension officer.
            </span>
          </p>
        </>
      )}
    </ReportCard>
  );
}
