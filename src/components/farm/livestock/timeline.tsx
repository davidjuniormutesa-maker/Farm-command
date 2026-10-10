"use client";

/**
 * Timeline — merged, chronological history of health events + vaccinations
 * for one animal or one group (Task 2-a). Items can be edited or deleted.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, History, Pencil, Pill, StickyNote, Trash2, User } from "lucide-react";
import { apiGet, apiSend, qk } from "@/lib/api";
import {
  computeVaccinationStatus,
  daysUntil,
  formatDate,
  statusBadgeClass,
  titleCase,
} from "@/lib/farm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { HealthEventWithRefs, TimelineEntry, VaccinationWithRefs } from "./livestock-helpers";
import { HEALTH_EVENT_ICONS, TIMELINE_VACCINATION_ICON, timelineIconClass } from "./livestock-helpers";

interface TimelineProps {
  animalId?: string | null;
  groupId?: string | null;
  onEditHealth?: (event: HealthEventWithRefs) => void;
  onEditVaccination?: (vaccination: VaccinationWithRefs) => void;
  /** Called after a delete so the owner can invalidate queries. */
  onChanged?: () => void;
}

export default function Timeline({ animalId, groupId, onEditHealth, onEditVaccination, onChanged }: TimelineProps) {
  const scopeParam = animalId ? `animalId=${animalId}` : `groupId=${groupId}`;
  const scopeKey = animalId ? "animal" : "group";
  const scopeId = animalId ?? groupId;

  const eventsQuery = useQuery({
    queryKey: [...qk.healthEvents, scopeKey, scopeId],
    queryFn: () => apiGet<HealthEventWithRefs[]>(`/api/health-events?${scopeParam}`),
    enabled: Boolean(scopeId),
  });
  const vaccinationsQuery = useQuery({
    queryKey: [...qk.vaccinations, scopeKey, scopeId],
    queryFn: () => apiGet<VaccinationWithRefs[]>(`/api/vaccinations?${scopeParam}`),
    enabled: Boolean(scopeId),
  });

  const entries = useMemo<TimelineEntry[]>(() => {
    const events = (eventsQuery.data ?? []).map(
      (event): TimelineEntry => ({ kind: "health", date: event.date, event })
    );
    const vaccinations = (vaccinationsQuery.data ?? []).map(
      (vaccination): TimelineEntry => ({ kind: "vaccination", date: vaccination.dateGiven, vaccination })
    );
    return [...events, ...vaccinations].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [eventsQuery.data, vaccinationsQuery.data]);

  if (eventsQuery.isLoading || vaccinationsQuery.isLoading) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center">
        <History className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">No history yet</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
          Record a health event or a vaccination and it will appear on this timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="farm-scroll max-h-[380px] space-y-2.5 overflow-y-auto pr-1" role="list" aria-label="History timeline">
      {entries.map((entry) => (
        <TimelineEntryCard
          key={`${entry.kind}-${entry.kind === "health" ? entry.event.id : entry.vaccination.id}`}
          entry={entry}
          onEditHealth={onEditHealth}
          onEditVaccination={onEditVaccination}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

// ---------- Single entry ----------

function TimelineEntryCard({
  entry,
  onEditHealth,
  onEditVaccination,
  onChanged,
}: {
  entry: TimelineEntry;
  onEditHealth?: (event: HealthEventWithRefs) => void;
  onEditVaccination?: (vaccination: VaccinationWithRefs) => void;
  onChanged?: () => void;
}) {
  const isVaccination = entry.kind === "vaccination";
  const vaccination = isVaccination ? entry.vaccination : null;
  const event = isVaccination ? null : entry.event;

  const eventType = isVaccination ? undefined : (event as HealthEventWithRefs).type;
  const Icon = isVaccination ? TIMELINE_VACCINATION_ICON : HEALTH_EVENT_ICONS[eventType ?? ""] ?? StickyNote;
  const iconClass = timelineIconClass(entry.kind, eventType);
  const title = isVaccination ? vaccination!.vaccineName : (event as HealthEventWithRefs).title;

  const nextDueDays = vaccination ? daysUntil(vaccination.nextDueDate) : null;

  const remove = async () => {
    try {
      if (isVaccination) {
        await apiSend(`/api/vaccinations/${vaccination!.id}`, "DELETE");
        toast.success("Vaccination deleted — its open reminder task was removed too");
      } else {
        await apiSend(`/api/health-events/${event!.id}`, "DELETE");
        toast.success("Health event deleted");
      }
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the record");
    }
  };

  return (
    <div role="listitem" className="group relative rounded-xl border bg-card p-3.5">
      <div className="flex items-start gap-3">
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${iconClass}`} aria-hidden>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold leading-snug">{title}</p>
            {isVaccination ? (
              <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${statusBadgeClass(computeVaccinationStatus(vaccination!))}`}>
                {computeVaccinationStatus(vaccination!)}
              </Badge>
            ) : (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
                {titleCase((event as HealthEventWithRefs).type)}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(entry.date)}
            {isVaccination && vaccination?.nextDueDate && (
              <>
                {" · Next due "}
                {formatDate(vaccination.nextDueDate)}
                {nextDueDays !== null && ` (${nextDueDays < 0 ? `${Math.abs(nextDueDays)}d overdue` : nextDueDays === 0 ? "today" : `in ${nextDueDays}d`})`}
              </>
            )}
          </p>

          {event?.details && <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{event.details}</p>}
          {vaccination?.notes && <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{vaccination.notes}</p>}

          {(event?.administeredBy || event?.medication || event?.withdrawalDays != null || vaccination?.administeredBy) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {(event?.administeredBy || vaccination?.administeredBy) && (
                <span className="flex items-center gap-1">
                  <User className="size-3" aria-hidden />
                  {event?.administeredBy ?? vaccination?.administeredBy}
                </span>
              )}
              {event?.medication && (
                <span className="flex items-center gap-1">
                  <Pill className="size-3" aria-hidden />
                  {event.medication}
                </span>
              )}
              {event?.withdrawalDays != null && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3" aria-hidden />
                  Withdrawal: {event.withdrawalDays} day{event.withdrawalDays === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {isVaccination && onEditVaccination && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Edit vaccination ${vaccination!.vaccineName}`}
              onClick={() => onEditVaccination(vaccination!)}
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          )}
          {!isVaccination && onEditHealth && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Edit health event ${title}`}
              onClick={() => onEditHealth(event!)}
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" aria-label={`Delete ${title}`}>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isVaccination
                    ? `"${vaccination!.vaccineName}" will be removed permanently. Its still-open reminder task is deleted with it.`
                    : `"${title}" will be removed permanently from the timeline.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault();
                    remove();
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
