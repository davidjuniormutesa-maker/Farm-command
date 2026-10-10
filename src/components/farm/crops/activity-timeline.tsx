"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Coins, MapPin, Sprout, Tag, Users } from "lucide-react";
import { apiGet, qk } from "@/lib/api";
import { formatDate, formatKwacha, titleCase } from "@/lib/farm";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityLinkContext, FarmActivityWithNames } from "./types";
import { ACTIVITY_TYPE_EMOJI } from "./shared";

/** Query key suffix built from the link filters, e.g. ["activities", { fieldId }]. */
export type ActivityFilter = ActivityLinkContext;

/** Fetches the activity log, optionally filtered by linked entities (latest first). */
export function useActivities(filter: ActivityFilter) {
  return useQuery({
    queryKey: [...qk.activities, filter] as const,
    queryFn: () => apiGet<FarmActivityWithNames[]>(`/api/activities${activitiesQueryString(filter)}`),
  });
}

function activitiesQueryString(filter: ActivityFilter): string {
  const params = new URLSearchParams();
  if (filter.cropCycleId) params.set("cropCycleId", filter.cropCycleId);
  if (filter.fieldId) params.set("fieldId", filter.fieldId);
  if (filter.animalId) params.set("animalId", filter.animalId);
  if (filter.groupId) params.set("groupId", filter.groupId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 rounded-lg border p-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Scrollable, latest-first timeline of farm activities with linked entity chips.
 * Wrap in a parent with a heading + "Log activity" action as needed.
 */
export function ActivityTimeline({
  filter,
  emptyHint = "No activities logged yet — field work, treatments and observations will appear here.",
}: {
  filter: ActivityFilter;
  emptyHint?: string;
}) {
  const { data: activities, isLoading } = useActivities(filter);

  if (isLoading) return <TimelineSkeleton />;

  if (!activities || activities.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {emptyHint}
      </p>
    );
  }

  return (
    <ol className="farm-scroll max-h-80 space-y-3 overflow-y-auto pr-1">
      {activities.map((a) => {
        const emoji = ACTIVITY_TYPE_EMOJI[a.type] ?? "📝";
        return (
          <li key={a.id} className="flex gap-3 rounded-lg border bg-card/60 p-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-base"
              aria-hidden
            >
              {emoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium leading-snug">{a.title}</span>
                <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {titleCase(a.type)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3" aria-hidden />
                {formatDate(a.date)}
              </div>
              {a.details && <p className="mt-1 text-sm leading-snug text-muted-foreground">{a.details}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {typeof a.cost === "number" && (
                  <span className="flex items-center gap-1 font-medium text-gold-foreground dark:text-gold">
                    <Coins className="size-3" aria-hidden />
                    {formatKwacha(a.cost)}
                  </span>
                )}
                {a.cropCycle && (
                  <span className="flex items-center gap-1">
                    <Sprout className="size-3 text-primary" aria-hidden />
                    {a.cropCycle.crop}
                  </span>
                )}
                {a.field && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3 text-primary" aria-hidden />
                    {a.field.name}
                  </span>
                )}
                {a.animal && (
                  <span className="flex items-center gap-1">
                    <Tag className="size-3 text-primary" aria-hidden />
                    {a.animal.name || a.animal.tagId}
                  </span>
                )}
                {a.group && (
                  <span className="flex items-center gap-1">
                    <Users className="size-3 text-primary" aria-hidden />
                    {a.group.name}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
