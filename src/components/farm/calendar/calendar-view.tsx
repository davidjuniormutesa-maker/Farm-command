"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, CalendarOff, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFarmStore } from "../store";
import { useCompleteTask } from "../tasks/use-task-actions";
import { DayDialog } from "./day-dialog";
import { KIND_LEGEND, TONE_CHIP, TONE_DOT, dateKey, useCalendarEvents } from "./calendar-events";
import type { CalendarEvent } from "./calendar-events";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MAX_CHIPS = 3;
const LIST_DAYS = 14;

/** Tinted pill background per tone for the legend (r9 styling pass). */
const LEGEND_PILL: Record<CalendarEvent["tone"], string> = {
  task: "border-primary/25 bg-primary/5",
  vaccOverdue: "border-destructive/25 bg-destructive/5",
  vaccUpcoming: "border-amber-300/60 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30",
  activity: "border-gold/40 bg-gold/10",
  harvest: "border-success/25 bg-success/5",
  rain: "border-cyan-300/50 bg-cyan-50/70 dark:border-cyan-900/60 dark:bg-cyan-950/30",
  birthExpected: "border-pink-300/60 bg-pink-50/70 dark:border-pink-900/60 dark:bg-pink-950/30",
  heatWindow: "border-violet-300/60 bg-violet-50/70 dark:border-violet-900/60 dark:bg-violet-950/30",
};

export default function CalendarView() {
  const { events, byDay, isLoading } = useCalendarEvents();
  const complete = useCompleteTask();
  const setView = useFarmStore((s) => s.setView);
  const requestQuickAction = useFarmStore((s) => s.requestQuickAction);

  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [mode, setMode] = useState<"month" | "list">("month");
  const [selected, setSelected] = useState<Date | null>(null);

  const cells = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
      }),
    [cursor]
  );

  const monthEvents = useMemo(
    () => events.filter((ev) => isSameMonth(new Date(ev.dateISO), cursor)),
    [events, cursor]
  );

  const listDays = useMemo(() => {
    const today = new Date();
    const days = eachDayOfInterval({ start: today, end: addDays(today, LIST_DAYS - 1) });
    return days.map((d) => ({ date: d, events: byDay.get(dateKey(d)) ?? [] }));
  }, [byDay]);

  const listHasEvents = listDays.some((d) => d.events.length > 0);
  const selectedEvents = selected ? (byDay.get(dateKey(selected)) ?? []) : [];

  const addTask = () => {
    requestQuickAction("add-task");
    setView("tasks");
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Tasks, vaccinations, crop activities and expected harvests in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-1" role="tablist" aria-label="Calendar mode">
            {(
              [
                { key: "month", label: "Month", icon: CalendarDays },
                { key: "list", label: "List", icon: List },
              ] as const
            ).map((m) => (
              <button
                key={m.key}
                role="tab"
                aria-selected={mode === m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                  mode === m.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                <m.icon className="size-4" aria-hidden />
                {m.label}
              </button>
            ))}
          </div>
          <Button className="min-h-11" onClick={addTask}>
            <Plus className="size-4" aria-hidden />
            Task
          </Button>
        </div>
      </div>

      {/* Legend — tinted pills so each kind reads at a glance (r9 styling pass) */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" role="list" aria-label="Event types">
        {KIND_LEGEND.map((l) => (
          <span
            key={l.kind}
            role="listitem"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
              LEGEND_PILL[l.tone]
            )}
          >
            <span className={cn("size-2 rounded-full", TONE_DOT[l.tone])} aria-hidden />
            {l.label}
          </span>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-8 w-48 rounded-md" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      ) : mode === "month" ? (
        <MonthGrid
          cursor={cursor}
          cells={cells}
          byDay={byDay}
          hasMonthEvents={monthEvents.length > 0}
          onPrev={() => setCursor((c) => subMonths(c, 1))}
          onNext={() => setCursor((c) => addMonths(c, 1))}
          onToday={() => setCursor(startOfMonth(new Date()))}
          onSelect={setSelected}
          onAddTask={addTask}
        />
      ) : (
        /* ---- 14-day list ---- */
        <Card>
          <CardContent className="flex flex-col gap-1 p-4 sm:p-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Next {LIST_DAYS} days
              </h2>
            </div>
            {!listHasEvents ? (
              <EmptyHint
                title="Nothing scheduled in the next two weeks"
                body="Enjoy the calm — or add a task to get ahead."
                onAddTask={addTask}
              />
            ) : (
              listDays.map(({ date, events: dayEvents }) =>
                dayEvents.length === 0 ? null : (
                  <div key={date.toISOString()} className="flex flex-col gap-2 border-b py-3 last:border-b-0">
                    <button
                      className="flex min-h-9 items-center gap-2 text-left text-sm font-semibold hover:text-primary"
                      onClick={() => setSelected(date)}
                    >
                      {format(date, "EEEE d MMMM")}
                      {isToday(date) && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          Today
                        </span>
                      )}
                      {dayEvents.length > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                          · {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
                        </span>
                      )}
                    </button>
                    <ul className="flex flex-col gap-1.5">
                      {dayEvents.map((ev) => (
                        <li key={ev.id}>
                          <button
                            className="flex w-full min-h-9 items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
                            onClick={() => setSelected(date)}
                          >
                            <span
                              className={cn("size-2 shrink-0 rounded-full", TONE_DOT[ev.tone])}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                            {ev.time && (
                              <span className="shrink-0 text-xs text-muted-foreground">{ev.time}</span>
                            )}
                            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                              {kindNoun(ev.kind)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* Day details */}
      {selected && (
        <DayDialog
          date={selected}
          events={selectedEvents}
          completePending={complete.isPending}
          onClose={() => setSelected(null)}
          onCompleteTask={(taskId) => complete.mutate(taskId)}
        />
      )}
    </div>
  );
}

/* ---------- Month grid ---------- */

interface MonthGridProps {
  cursor: Date;
  cells: Date[];
  byDay: Map<string, CalendarEvent[]>;
  hasMonthEvents: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect: (d: Date) => void;
  onAddTask: () => void;
}

function MonthGrid({
  cursor,
  cells,
  byDay,
  hasMonthEvents,
  onPrev,
  onNext,
  onToday,
  onSelect,
  onAddTask,
}: MonthGridProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={onPrev}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <h2 className="text-center text-base font-semibold" aria-live="polite">
            {format(cursor, "MMMM yyyy")}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="min-h-9 px-3 max-sm:hidden" onClick={onToday}>
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              onClick={onNext}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" className="min-h-9 sm:hidden" onClick={onToday}>
          Today
        </Button>

        {!hasMonthEvents ? (
          <EmptyHint
            title="Nothing scheduled this month"
            body="No tasks, vaccinations, activities or harvests fall in this month."
            onAddTask={onAddTask}
          />
        ) : (
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
            {/* Weekday header */}
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="bg-muted/60 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                aria-hidden
              >
                {d}
              </div>
            ))}

            {/* Day cells */}
            {cells.map((day) => {
              const key = dateKey(day);
              const dayEvents = byDay.get(key) ?? [];
              const outside = !isSameMonth(day, cursor);
              return (
                <button
                  key={key}
                  onClick={() => onSelect(day)}
                  aria-label={`${format(day, "d MMMM yyyy")}${dayEvents.length ? `, ${dayEvents.length} events` : ""}`}
                  className={cn(
                    "flex h-11 flex-col items-stretch gap-0.5 bg-card p-1 text-left transition-colors hover:bg-accent sm:h-24 sm:gap-1 sm:p-1.5",
                    outside && "opacity-40 hover:opacity-70",
                    isToday(day) && "ring-2 ring-inset ring-primary"
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] leading-none text-muted-foreground sm:text-xs",
                      isToday(day) && "font-bold text-primary"
                    )}
                  >
                    {format(day, "d")}
                  </span>

                  {/* Mobile: dots only */}
                  <span className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                    {dayEvents.slice(0, 4).map((ev) => (
                      <span key={ev.id} className={cn("size-1.5 rounded-full", TONE_DOT[ev.tone])} />
                    ))}
                  </span>

                  {/* Desktop: chips */}
                  <span className="hidden flex-col gap-1 overflow-hidden sm:flex">
                    {dayEvents.slice(0, MAX_CHIPS).map((ev) => (
                      <span
                        key={ev.id}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight",
                          TONE_CHIP[ev.tone]
                        )}
                      >
                        {ev.time ? `${ev.time} ` : ""}
                        {ev.title}
                      </span>
                    ))}
                    {dayEvents.length > MAX_CHIPS && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayEvents.length - MAX_CHIPS} more
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Shared empty state ---------- */

function EmptyHint({ title, body, onAddTask }: { title: string; body: string; onAddTask: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
      <CalendarOff className="size-8 text-muted-foreground/60" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
      <Button variant="outline" size="sm" className="min-h-9 mt-1" onClick={onAddTask}>
        <Plus className="size-4" aria-hidden />
        Add a task
      </Button>
    </div>
  );
}

function kindNoun(kind: CalendarEvent["kind"]): string {
  switch (kind) {
    case "task":
      return "Task";
    case "vaccination":
      return "Vaccination";
    case "activity":
      return "Activity";
    case "harvest":
      return "Harvest";
    case "rain":
      return "Rainfall";
    case "birth":
      return "Expected birth";
    case "heat":
      return "Heat window";
  }
}
