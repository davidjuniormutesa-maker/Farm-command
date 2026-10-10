"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, qk } from "@/lib/api";
import {
  VACCINATION_STATUS,
  computeTaskStatus,
  computeVaccinationStatus,
  formatDateShort,
} from "@/lib/farm";
import type {
  AnimalDTO,
  CropCycleDTO,
  FarmActivityDTO,
  HealthEventDTO,
  RainfallResponseDTO,
  VaccinationDTO,
} from "@/lib/farm";
import type { TaskWithLinks } from "../tasks/task-types";
import { deriveBreedingOutlook } from "../reports/breeding-derive";

export type CalendarEventKind =
  | "task"
  | "vaccination"
  | "activity"
  | "harvest"
  | "rain"
  | "birth"
  | "heat";
export type EventTone =
  | "task"
  | "vaccOverdue"
  | "vaccUpcoming"
  | "activity"
  | "harvest"
  | "rain"
  | "birthExpected"
  | "heatWindow";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  tone: EventTone;
  /** Local-time YYYY-MM-DD key */
  dateKey: string;
  dateISO: string;
  title: string;
  time?: string | null;
  /** Task status / vaccination status / activity type / "harvest" */
  status: string;
  detail?: string | null;
  task?: TaskWithLinks;
}

/** Solid chip styles per tone (calendar cells + legend). */
export const TONE_CHIP: Record<EventTone, string> = {
  task: "bg-primary text-primary-foreground",
  vaccOverdue: "bg-destructive text-white",
  vaccUpcoming: "bg-amber-500 text-amber-950",
  activity: "bg-gold text-gold-foreground",
  harvest: "bg-success text-white",
  rain: "bg-cyan-600 text-white",
  birthExpected: "bg-pink-600 text-white",
  heatWindow: "bg-violet-600 text-white",
};

/** Dot styles per tone (legend, mobile grid dots, list rows). */
export const TONE_DOT: Record<EventTone, string> = {
  task: "bg-primary",
  vaccOverdue: "bg-destructive",
  vaccUpcoming: "bg-amber-500",
  activity: "bg-gold",
  harvest: "bg-success",
  rain: "bg-cyan-600",
  birthExpected: "bg-pink-600",
  heatWindow: "bg-violet-600",
};

/** Legend entry per event kind. */
export const KIND_LEGEND: Array<{ kind: CalendarEventKind; label: string; tone: EventTone }> = [
  { kind: "task", label: "Tasks", tone: "task" },
  { kind: "vaccination", label: "Vaccinations", tone: "vaccOverdue" },
  { kind: "activity", label: "Activities", tone: "activity" },
  { kind: "harvest", label: "Harvests", tone: "harvest" },
  { kind: "birth", label: "Expected births", tone: "birthExpected" },
  { kind: "heat", label: "Heat windows", tone: "heatWindow" },
  { kind: "rain", label: "Rainfall", tone: "rain" },
];

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Aggregates the calendar event sources:
 * tasks (dueDate) · vaccinations (nextDueDate) · farm activities (date) ·
 * expected harvests of growing crop cycles · breeding outlook (expected
 * births + re-breeding heat windows, r9 — same derivation as the Reports
 * card via breeding-derive.ts) · rainfall readings.
 * Sources owned by other agents degrade to empty lists.
 */
export function useCalendarEvents() {
  const tasksQ = useQuery({
    queryKey: qk.tasks,
    queryFn: () => apiGet<TaskWithLinks[]>("/api/tasks").catch(() => []),
  });
  const vaccinationsQ = useQuery({
    queryKey: qk.vaccinations,
    queryFn: () => apiGet<VaccinationDTO[]>("/api/vaccinations").catch(() => []),
  });
  const activitiesQ = useQuery({
    queryKey: qk.activities,
    queryFn: () => apiGet<FarmActivityDTO[]>("/api/activities").catch(() => []),
  });
  const cropsQ = useQuery({
    queryKey: qk.crops,
    queryFn: () => apiGet<CropCycleDTO[]>("/api/crops").catch(() => []),
  });
  const rainfallQ = useQuery({
    queryKey: qk.rainfall,
    queryFn: () => apiGet<RainfallResponseDTO>("/api/rainfall").catch(() => null),
  });
  // Breeding outlook sources (r9) — reads come from IndexedDB, so they are
  // cheap and keep the markers in sync with the Reports card.
  const animalsQ = useQuery({
    queryKey: qk.animals,
    queryFn: () => apiGet<AnimalDTO[]>("/api/animals").catch(() => []),
  });
  const healthEventsQ = useQuery({
    queryKey: qk.healthEvents,
    queryFn: () => apiGet<HealthEventDTO[]>("/api/health-events").catch(() => []),
  });

  const events = useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = [];

    for (const t of tasksQ.data ?? []) {
      if (t.status === "cancelled") continue;
      list.push({
        id: `task-${t.id}`,
        kind: "task",
        tone: "task",
        dateKey: dateKey(new Date(t.dueDate)),
        dateISO: t.dueDate,
        title: t.title,
        time: t.dueTime,
        status: computeTaskStatus(t),
        detail: t.description ?? null,
        task: t,
      });
    }

    for (const v of vaccinationsQ.data ?? []) {
      if (!v.nextDueDate) continue;
      const status = computeVaccinationStatus(v);
      if (status === VACCINATION_STATUS.COMPLETED) continue;
      list.push({
        id: `vac-${v.id}`,
        kind: "vaccination",
        tone: status === VACCINATION_STATUS.OVERDUE ? "vaccOverdue" : "vaccUpcoming",
        dateKey: dateKey(new Date(v.nextDueDate)),
        dateISO: v.nextDueDate,
        title: v.vaccineName,
        status,
        detail: v.administeredBy ? `Administered by ${v.administeredBy}` : (v.notes ?? null),
      });
    }

    for (const a of activitiesQ.data ?? []) {
      list.push({
        id: `act-${a.id}`,
        kind: "activity",
        tone: "activity",
        dateKey: dateKey(new Date(a.date)),
        dateISO: a.date,
        title: a.title,
        status: a.type,
        detail: a.details ?? null,
      });
    }

    for (const c of cropsQ.data ?? []) {
      if (c.status !== "growing" || !c.expectedHarvestDate) continue;
      list.push({
        id: `harv-${c.id}`,
        kind: "harvest",
        tone: "harvest",
        dateKey: dateKey(new Date(c.expectedHarvestDate)),
        dateISO: c.expectedHarvestDate,
        title: `${c.crop} harvest expected`,
        status: "harvest",
        detail: c.variety ?? null,
      });
    }

    for (const r of rainfallQ.data?.readings ?? []) {
      if (r.mm <= 0) continue; // only wet days get a chip — dry-day notes live in the day dialog
      list.push({
        id: `rain-${r.id}`,
        kind: "rain",
        tone: "rain",
        dateKey: dateKey(new Date(r.date)),
        dateISO: r.date,
        title: `Rain ${r.mm} mm`,
        status: "rain",
        detail: r.note ?? null,
      });
    }

    // Breeding outlook (r9) — expected births + re-breeding heat windows.
    const { births, windows } = deriveBreedingOutlook(animalsQ.data ?? [], healthEventsQ.data ?? []);
    for (const b of births) {
      list.push({
        id: `birth-${b.key}`,
        kind: "birth",
        tone: "birthExpected",
        dateKey: dateKey(new Date(b.expectedOn)),
        dateISO: b.expectedOn,
        title: `Birth expected — ${b.label}`,
        status: b.stage,
        detail: `Bred ${formatDateShort(b.bredOn)} · ${b.overdue ? `${Math.abs(b.daysRemaining)}d overdue` : `${b.daysRemaining}d left`}`,
      });
    }
    for (const w of windows) {
      list.push({
        id: `heat-${w.key}`,
        kind: "heat",
        tone: "heatWindow",
        dateKey: dateKey(new Date(w.opensOn)),
        dateISO: w.opensOn,
        title: `Heat window — ${w.label}`,
        status: w.openNow ? "open" : "upcoming",
        detail: `Birth ${formatDateShort(w.birthOn)} · re-breeding window opens`,
      });
    }

    return list.sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
  }, [
    tasksQ.data,
    vaccinationsQ.data,
    activitiesQ.data,
    cropsQ.data,
    rainfallQ.data,
    animalsQ.data,
    healthEventsQ.data,
  ]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const bucket = map.get(ev.dateKey);
      if (bucket) bucket.push(ev);
      else map.set(ev.dateKey, [ev]);
    }
    return map;
  }, [events]);

  return {
    events,
    byDay,
    isLoading:
      tasksQ.isLoading ||
      vaccinationsQ.isLoading ||
      activitiesQ.isLoading ||
      cropsQ.isLoading ||
      animalsQ.isLoading ||
      healthEventsQ.isLoading,
  };
}
