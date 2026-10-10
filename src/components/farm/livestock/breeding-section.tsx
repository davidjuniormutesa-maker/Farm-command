"use client";

/**
 * BreedingSection (r5) — gestation tracker on the animal profile.
 * Derives an active pregnancy purely from health-event history: the latest
 * `breeding` event not yet followed by a `birth`. Visual language mirrors the
 * amber WeightHistory goal bar so "progress toward a date" reads consistently.
 */

import { useQuery } from "@tanstack/react-query";
import { Baby, Heart, Loader2 } from "lucide-react";
import { apiGet, qk } from "@/lib/api";
import { computeGestation, formatDate, GESTATION_DAYS, type HealthEventDTO } from "@/lib/farm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnimalWithGroup } from "./livestock-helpers";

interface BreedingSectionProps {
  animal: AnimalWithGroup;
  /** Opens the health form with a preselected event type ("breeding" | "birth"). */
  onLogEvent: (defaultType: string) => void;
}

export default function BreedingSection({ animal, onLogEvent }: BreedingSectionProps) {
  // Hooks first — the male/unknown-species early returns below are render-time
  // decisions, so the query must run unconditionally (rules of hooks).
  const eventsQuery = useQuery({
    queryKey: [...qk.healthEvents, "animal", animal.id],
    queryFn: () => apiGet<HealthEventDTO[]>(`/api/health-events?animalId=${animal.id}`),
  });

  // Bulls, rams, bucks and cocks don't carry pregnancies — hide the section.
  const sex = animal.sex?.trim().toLowerCase();
  if (sex === "male") return null;

  // Species we can't compute a window for (e.g. "Other") — skip entirely.
  if (!(animal.species in GESTATION_DAYS)) return null;

  const events = eventsQuery.data ?? [];
  const gestation = computeGestation(events, animal.species);
  const lastCycle = findLastCompletedCycle(events);
  const isPoultry = animal.species === "Poultry";

  return (
    <section aria-label="Breeding and gestation">
      <h3 className="mb-2.5 text-sm font-semibold tracking-tight">Breeding &amp; gestation</h3>

      {eventsQuery.isLoading && (
        <Skeleton className="h-20 w-full rounded-lg" />
      )}

      {gestation && (
        <div
          className={`rounded-lg border px-3 py-2.5 ${
            gestation.overdue
              ? "border-red-200/70 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/30"
              : "border-amber-200/70 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/30"
          }`}
          role="status"
          aria-label={`Bred on ${formatDate(gestation.bredOn)}. ${
            isPoultry ? "Expected hatch" : "Expected delivery"
          } ${formatDate(gestation.expectedOn)}, ${Math.abs(gestation.daysRemaining)} days ${
            gestation.overdue ? "overdue" : "to go"
          }, ${gestation.progressPct} percent`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Heart
                className={`size-4 shrink-0 ${gestation.overdue ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
                aria-hidden
              />
              {gestation.overdue
                ? `Overdue by ${Math.abs(gestation.daysRemaining)} day${Math.abs(gestation.daysRemaining) === 1 ? "" : "s"}`
                : `${gestation.daysRemaining} day${gestation.daysRemaining === 1 ? "" : "s"} to go`}
              <Badge variant="outline" className="ml-1 text-[11px]">
                {gestation.stage}
              </Badge>
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">{gestation.progressPct}%</p>
          </div>

          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/50"
            aria-hidden
          >
            <div
              className={`h-full rounded-full transition-all ${
                gestation.overdue ? "bg-red-500" : "bg-amber-500"
              }`}
              style={{ width: `${gestation.progressPct}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Bred {formatDate(gestation.bredOn)} · {isPoultry ? "Expected hatch" : "Expected delivery"}{" "}
            <span className="font-medium text-foreground">{formatDate(gestation.expectedOn)}</span>
            {gestation.overdue && " — watch her closely"}
          </p>

          {!isPoultry && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5 min-h-9"
              onClick={() => onLogEvent("birth")}
            >
              <Baby className="size-4" aria-hidden />
              Record birth
            </Button>
          )}
        </div>
      )}

      {!eventsQuery.isLoading && !gestation && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {lastCycle
              ? `Last cycle: bred ${formatDate(new Date(lastCycle.bredMs).toISOString())} → birth ${formatDate(
                  new Date(lastCycle.birthMs).toISOString(),
                )} (${Math.round((lastCycle.birthMs - lastCycle.bredMs) / 86_400_000)} days).`
              : isPoultry
                ? "No nesting tracked yet. Log a breeding to count down the ~21-day hatch."
                : "No breeding on record. Log one to track the gestation countdown."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-9 shrink-0"
            onClick={() => onLogEvent("breeding")}
            disabled={eventsQuery.isLoading}
          >
            {eventsQuery.isLoading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Heart className="size-4" aria-hidden />
            )}
            Log breeding
          </Button>
        </div>
      )}
    </section>
  );
}

/** Most recent breeding that was followed by a birth (completed cycle). */
function findLastCompletedCycle(
  events: HealthEventDTO[],
): { bredMs: number; birthMs: number } | null {
  const breedings = events
    .filter((e) => e.type === "breeding")
    .map((e) => Date.parse(e.date))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a);
  if (breedings.length === 0) return null;
  const births = events
    .filter((e) => e.type === "birth")
    .map((e) => Date.parse(e.date))
    .filter((t) => !Number.isNaN(t));
  for (const bredMs of breedings) {
    const birthMs = births.filter((t) => t > bredMs).sort((a, b) => a - b)[0];
    if (birthMs != null) return { bredMs, birthMs };
  }
  return null;
}
