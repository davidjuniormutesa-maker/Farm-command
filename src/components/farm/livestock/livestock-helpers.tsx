"use client";

/**
 * Livestock module — shared types, species visuals, status badges and small helpers.
 * Task 2-a. Only the livestock module imports this file.
 */

import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Cross,
  Eye,
  Heart,
  HeartPulse,
  Move,
  Pill,
  Scale,
  Stethoscope,
  StickyNote,
  Syringe,
} from "lucide-react";
import type { AnimalDTO, HealthEventDTO, LivestockGroupDTO, VaccinationDTO } from "@/lib/farm";
import { daysUntil } from "@/lib/farm";

// ---------- Shared DTO extensions (API returns these refs for display) ----------

export type AnimalWithGroup = AnimalDTO & { group?: { name: string } | null };

export type VaccinationWithRefs = VaccinationDTO & {
  animal?: { tagId: string; name: string | null } | null;
  group?: { name: string } | null;
};

export type HealthEventWithRefs = HealthEventDTO & {
  animal?: { tagId: string; name: string | null } | null;
  group?: { name: string } | null;
};

/** Fixed target context for health/vaccination forms (e.g. opened from a detail dialog). */
export interface FormTarget {
  animalId?: string | null;
  groupId?: string | null;
  label: string;
  /** Optional event type to preselect when opening the health form. */
  defaultType?: string;
}

/** A merged history entry (health event or vaccination) for the detail timeline. */
export type TimelineEntry =
  | { kind: "health"; date: string; event: HealthEventWithRefs }
  | { kind: "vaccination"; date: string; vaccination: VaccinationWithRefs };

// ---------- Species ----------

export function speciesEmoji(species: string): string {
  switch (species) {
    case "Cattle":
      return "🐄";
    case "Goats":
      return "🐐";
    case "Sheep":
      return "🐑";
    case "Pigs":
      return "🐖";
    case "Poultry":
      return "🐔";
    default:
      return "🐾";
  }
}

/** Warm farm-palette tints per species (no blue/indigo). */
export function speciesAvatarClass(species: string): string {
  switch (species) {
    case "Cattle":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
    case "Goats":
      return "bg-lime-100 text-lime-900 dark:bg-lime-950/50 dark:text-lime-200";
    case "Sheep":
      return "bg-stone-100 text-stone-800 dark:bg-stone-800/60 dark:text-stone-200";
    case "Pigs":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200";
    case "Poultry":
      return "bg-yellow-100 text-yellow-900 dark:bg-yellow-950/50 dark:text-yellow-200";
    default:
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
  }
}

export function SpeciesAvatar({ species, className }: { species: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-xl ${speciesAvatarClass(species)} ${className ?? ""}`}
    >
      {speciesEmoji(species)}
    </div>
  );
}

// ---------- Animal status + age ----------

export function animalStatusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
    case "sold":
      return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
    case "deceased":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900";
    default:
      return "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800/60 dark:text-stone-300 dark:border-stone-700";
  }
}

/** Age from birthDate (years/months) or fall back to the user-entered estimatedAge. */
export function ageLabel(animal: Pick<AnimalDTO, "birthDate" | "estimatedAge">): string {
  if (animal.birthDate) {
    const birth = new Date(animal.birthDate);
    const now = new Date();
    let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if (now.getDate() < birth.getDate()) months -= 1;
    if (months <= 0) return "< 1 mo";
    if (months < 12) return `${months} mo`;
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return rest ? `${years} yr ${rest} mo` : `${years} yr`;
  }
  return animal.estimatedAge || "—";
}

// ---------- Timeline icons + labels ----------

export const HEALTH_EVENT_ICONS: Record<string, LucideIcon> = {
  observation: Eye,
  treatment: Pill,
  vet_visit: Stethoscope,
  breeding: Heart,
  pregnancy: HeartPulse,
  birth: Baby,
  death: Cross,
  movement: Move,
  weight: Scale,
  note: StickyNote,
};

export function healthEventIcon(type: string): LucideIcon {
  return HEALTH_EVENT_ICONS[type] ?? StickyNote;
}

export function timelineIconClass(kind: TimelineEntry["kind"], type?: string): string {
  if (kind === "vaccination") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  switch (type) {
    case "treatment":
    case "vet_visit":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "death":
      return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
    case "breeding":
    case "pregnancy":
    case "birth":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300";
    default:
      return "bg-stone-100 text-stone-700 dark:bg-stone-800/70 dark:text-stone-300";
  }
}

export const TIMELINE_VACCINATION_ICON: LucideIcon = Syringe;

// ---------- Labels ----------

/** "C-023 · Mama" | "C-031" | group name — for UI display. */
export function animalRefLabel(animal: { tagId: string; name?: string | null }): string {
  return animal.name ? `${animal.tagId} · ${animal.name}` : animal.tagId;
}

export function vaccinationTargetLabel(v: VaccinationWithRefs): string {
  if (v.animal) return animalRefLabel(v.animal);
  if (v.group) return v.group.name;
  return "—";
}

/** "Due today" | "Tomorrow" | "In 6 days" | "2 days overdue" */
export function relativeDueLabel(iso: string | null | undefined): string {
  const days = daysUntil(iso);
  if (days === null) return "";
  if (days === 0) return "Due today";
  if (days === 1) return "Tomorrow";
  if (days < 0) {
    const n = Math.abs(days);
    return `${n} day${n === 1 ? "" : "s"} overdue`;
  }
  return `In ${days} days`;
}
