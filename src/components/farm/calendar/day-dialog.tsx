"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Check, Clock, CloudRain, NotebookPen, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiGet, apiSend, qk } from "@/lib/api";
import { PRIORITY_LABEL, statusBadgeClass, titleCase } from "@/lib/farm";
import type { RainfallResponseDTO } from "@/lib/farm";
import type { TaskStatus } from "@/lib/farm";
import RainLogDialog from "../rainfall/rain-log-dialog";
import { TONE_CHIP } from "./calendar-events";
import type { CalendarEvent } from "./calendar-events";

const KIND_LABEL: Record<CalendarEvent["kind"], string> = {
  task: "Task",
  vaccination: "Vaccination",
  activity: "Activity",
  harvest: "Harvest",
  rain: "Rainfall",
  birth: "Expected birth",
  heat: "Heat window",
};

const KIND_BADGE: Record<CalendarEvent["kind"], string> = {
  task: "border-primary/40 text-primary",
  vaccination: "border-destructive/40 text-destructive",
  activity: "border-gold/60 text-gold-foreground",
  harvest: "border-success/50 text-success",
  rain: "border-cyan-600/40 text-cyan-700 dark:text-cyan-400",
  birth: "border-pink-400/60 text-pink-700 dark:text-pink-300",
  heat: "border-violet-400/60 text-violet-700 dark:text-violet-300",
};

interface DayDialogProps {
  date: Date;
  events: CalendarEvent[];
  completePending: boolean;
  onClose: () => void;
  onCompleteTask: (taskId: string) => void;
}

/** Day details dialog — opened by clicking a calendar day or a list row. */
export function DayDialog({
  date,
  events,
  completePending,
  onClose,
  onCompleteTask,
}: DayDialogProps) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="farm-scroll max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            {date.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </DialogTitle>
          <DialogDescription>
            {events.filter((ev) => ev.kind !== "rain").length === 0
              ? "Nothing planned for this day."
              : `${events.filter((ev) => ev.kind !== "rain").length} ${
                  events.filter((ev) => ev.kind !== "rain").length === 1 ? "event" : "events"
                } on this day.`}
          </DialogDescription>
        </DialogHeader>

        {/* Rainfall quick log (Task r4) — lives above the event list */}
        <DayRainfallSection date={date} />

        <ul className="farm-scroll flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
          {events
            .filter((ev) => ev.kind !== "rain")
            .map((ev) => (
            <li
              key={ev.id}
              className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 sm:flex-row sm:items-start sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                      TONE_CHIP[ev.tone]
                    )}
                  >
                    {KIND_LABEL[ev.kind]}
                  </span>
                  {ev.time && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" aria-hidden />
                      {ev.time}
                    </span>
                  )}
                  {ev.kind === "task" ? (
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px]",
                        statusBadgeClass(ev.status)
                      )}
                    >
                      {statusLabel(ev.status)}
                    </span>
                  ) : (
                    <Badge variant="outline" className={cn("text-[11px]", KIND_BADGE[ev.kind])}>
                      {ev.kind === "harvest" ? "Expected" : titleCase(ev.status)}
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-medium leading-5">{ev.title}</p>
                {ev.detail && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <NotebookPen className="mt-0.5 size-3 shrink-0" aria-hidden />
                    {ev.detail}
                  </p>
                )}
                {ev.task && ev.task.status === "open" && (
                  <p className="text-xs text-muted-foreground">
                    Priority: {PRIORITY_LABEL[ev.task.priority] ?? titleCase(ev.task.priority)}
                  </p>
                )}
              </div>
              {ev.kind === "task" && ev.task && ev.task.status === "open" && (
                <Button
                  size="sm"
                  className="h-9 min-h-11 shrink-0 px-3 sm:min-h-9"
                  disabled={completePending}
                  onClick={() => onCompleteTask(ev.task!.id)}
                >
                  <Check className="size-4" aria-hidden />
                  Complete
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inline rainfall strip for one calendar day — shows the logged reading (if any)
 * with edit/delete, or a quick "log rain" call to action. Shares the qk.rainfall
 * cache with the dashboard weather card.
 */
function DayRainfallSection({ date }: { date: Date }) {
  const queryClient = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const key = dayKey(date);

  const { data } = useQuery({
    queryKey: qk.rainfall,
    queryFn: () => apiGet<RainfallResponseDTO>("/api/rainfall"),
    staleTime: 60_000,
  });

  const reading = (data?.readings ?? []).find((r) => dayKey(new Date(r.date)) === key);

  const remove = async () => {
    if (!reading) return;
    setDeleting(true);
    try {
      await apiSend(`/api/rainfall/${reading.id}`, "DELETE");
      toast.success("Rainfall record removed");
      queryClient.invalidateQueries({ queryKey: qk.rainfall });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the record");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section
      aria-label="Rainfall for this day"
      className="rounded-lg border border-cyan-200/70 bg-cyan-50/60 p-3 dark:border-cyan-900/50 dark:bg-cyan-950/30"
    >
      <div className="flex items-center gap-2">
        <CloudRain className="size-4 shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-cyan-900 dark:text-cyan-300">
          Rainfall
        </h4>
        {reading ? (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-sm font-semibold tabular-nums text-cyan-900 dark:text-cyan-100">
              {reading.mm} mm
            </span>
            <button
              type="button"
              className="rounded p-1 text-cyan-800/70 transition-colors hover:bg-cyan-100 hover:text-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-600 dark:text-cyan-200/70 dark:hover:bg-cyan-900/50"
              aria-label="Edit rainfall reading"
              onClick={() => setLogOpen(true)}
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="rounded p-1 text-cyan-800/70 transition-colors hover:bg-red-100 hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-destructive dark:text-cyan-200/70"
              aria-label="Delete rainfall reading"
              onClick={remove}
              disabled={deleting}
            >
              {deleting ? (
                <span className="block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
              ) : (
                <Trash2 className="size-3.5" aria-hidden />
              )}
            </button>
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto min-h-9 gap-1 border-cyan-300/70 text-cyan-800 hover:bg-cyan-100 dark:border-cyan-800 dark:text-cyan-300 dark:hover:bg-cyan-900/40"
            onClick={() => setLogOpen(true)}
          >
            <CloudRain className="size-3.5" aria-hidden />
            Log rain
          </Button>
        )}
      </div>
      {reading && (
        <p className="mt-1 text-[11px] leading-relaxed text-cyan-900/70 dark:text-cyan-200/70">
          {reading.note ? reading.note : reading.mm === 0 ? "Logged as a dry day." : "Recorded from your rain gauge."}
        </p>
      )}
      {logOpen && (
        <RainLogDialog
          date={date.toISOString()}
          existing={reading ? { mm: reading.mm, note: reading.note } : null}
          onClose={() => setLogOpen(false)}
        />
      )}
    </section>
  );
}

function statusLabel(status: string): string {
  switch (status as TaskStatus | string) {
    case "overdue":
      return "Overdue";
    case "due_today":
      return "Due today";
    case "upcoming":
      return "Upcoming";
    case "done":
      return "Completed";
    default:
      return titleCase(status);
  }
}
