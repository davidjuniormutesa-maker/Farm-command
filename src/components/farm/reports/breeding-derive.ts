"use client";

/**
 * breeding-derive (r9) — shared derivation of the breeding & heat outlook.
 *
 * ONE source of truth for both the Reports card (breeding-report.tsx) and the
 * Calendar markers (calendar-events.ts), so the two views can never drift.
 *
 * Derived entirely from records the farmer already keeps: health events of
 * type "breeding" and "birth", grouped by animal client-side (the offline
 * facade returns one flat list).
 *  - Expected births: open gestations (latest breeding not yet followed by a
 *    birth) via computeGestation from @/lib/farm — logic reused, not copied.
 *  - Re-breeding windows: females whose last birth (≤ 6 months ago) opens a
 *    heat window at birth + HEAT_WINDOW_DAYS. Poultry is excluded — an egg
 *    cycle, not a heat cycle.
 *
 * Pure data — no hooks, no queries. `nowMs` is injected so callers (and
 * future tests) can derive for any moment in time.
 */

import { computeGestation, type AnimalDTO, type HealthEventDTO } from "@/lib/farm";

/** Average days from birth to the next standing heat. */
export const HEAT_WINDOW_DAYS: Record<string, number> = {
  Cattle: 60,
  Goats: 21,
  Sheep: 21,
  Pigs: 28,
};

const DAY_MS = 86_400_000;
/** Only births from the last ~6 months are useful for timing a re-breeding. */
export const REBREED_LOOKBACK_DAYS = 183;

export interface ExpectedBirthRow {
  key: string;
  label: string;
  bredOn: string;
  expectedOn: string;
  daysRemaining: number;
  overdue: boolean;
  stage: string;
}

export interface HeatWindowRow {
  key: string;
  label: string;
  birthOn: string;
  opensOn: string;
  daysUntilOpen: number;
  openNow: boolean;
}

export interface BreedingOutlook {
  births: ExpectedBirthRow[];
  windows: HeatWindowRow[];
}

export function animalLabel(a: AnimalDTO): string {
  return a.name ? `${a.tagId} · ${a.name}` : a.tagId;
}

/** Derive expected births + re-breeding windows for the whole farm. */
export function deriveBreedingOutlook(
  animals: AnimalDTO[],
  events: HealthEventDTO[],
  nowMs: number = Date.now()
): BreedingOutlook {
  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const sixMonthsAgoMs = nowMs - REBREED_LOOKBACK_DAYS * DAY_MS;

  // Group health events by animal (one flat list from the facade).
  const eventsByAnimal = new Map<string, HealthEventDTO[]>();
  for (const e of events) {
    if (!e.animalId) continue;
    const list = eventsByAnimal.get(e.animalId);
    if (list) list.push(e);
    else eventsByAnimal.set(e.animalId, [e]);
  }

  // Only active females carry pregnancies or heat cycles.
  const activeFemales = animals.filter(
    (a) => a.status.trim().toLowerCase() === "active" && a.sex?.trim().toLowerCase() === "female"
  );

  const births: ExpectedBirthRow[] = [];
  const windows: HeatWindowRow[] = [];

  for (const animal of activeFemales) {
    const own = eventsByAnimal.get(animal.id) ?? [];
    const gestation = computeGestation(own, animal.species);

    if (gestation) {
      births.push({
        key: animal.id,
        label: animalLabel(animal),
        bredOn: gestation.bredOn,
        expectedOn: gestation.expectedOn,
        daysRemaining: gestation.daysRemaining,
        overdue: gestation.overdue,
        stage: gestation.stage,
      });
    }

    // Re-breeding window: known heat species, birth in the last 6 months and
    // NO open gestation (a re-bred female is already on the births list).
    const windowDays = HEAT_WINDOW_DAYS[animal.species];
    if (!windowDays || gestation) continue;
    const lastBirthMs = own
      .filter((e) => e.type === "birth")
      .map((e) => Date.parse(e.date))
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => b - a)[0];
    if (lastBirthMs == null || lastBirthMs < sixMonthsAgoMs) continue;
    const opensMs = lastBirthMs + windowDays * DAY_MS;
    windows.push({
      key: animal.id,
      label: animalLabel(animal),
      birthOn: new Date(lastBirthMs).toISOString(),
      opensOn: new Date(opensMs).toISOString(),
      daysUntilOpen: Math.round((opensMs - todayStartMs) / DAY_MS),
      openNow: opensMs <= nowMs,
    });
  }

  // Soonest first — overdue/open-now entries (dates in the past) surface first.
  births.sort((a, b) => Date.parse(a.expectedOn) - Date.parse(b.expectedOn));
  windows.sort((a, b) => Date.parse(a.opensOn) - Date.parse(b.opensOn));

  return { births, windows };
}
