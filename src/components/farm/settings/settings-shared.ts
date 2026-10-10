"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiSend, qk } from "@/lib/api";
import type { FarmSettingsData } from "@/lib/farm";

/** Timezones offered in Settings — Lusaka first. */
export const TIMEZONES = [
  "Africa/Lusaka",
  "Africa/Harare",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Europe/London",
  "UTC",
] as const;

/** Tables offered for CSV export (served by GET /api/backup/csv?table=…). */
export const CSV_TABLES: { value: string; label: string }[] = [
  { value: "animals", label: "Animals" },
  { value: "groups", label: "Livestock groups" },
  { value: "fields", label: "Fields" },
  { value: "crops", label: "Crop cycles" },
  { value: "tasks", label: "Tasks" },
  { value: "transactions", label: "Transactions" },
  { value: "vaccinations", label: "Vaccinations" },
  { value: "activities", label: "Activities" },
  { value: "health-events", label: "Health events" },
  { value: "weights", label: "Weight records" },
];

/** Shape of POST /api/backup success response (2-d contract). */
export interface BackupCounts {
  groups?: number;
  animals?: number;
  fields?: number;
  cropCycles?: number;
  weightRecords?: number;
  healthEvents?: number;
  vaccinations?: number;
  activities?: number;
  tasks?: number;
  transactions?: number;
  knowledgeArticles?: number;
  farmSettings?: number;
}

const COUNT_LABELS: Record<string, string> = {
  groups: "groups",
  animals: "animals",
  fields: "fields",
  cropCycles: "crop cycles",
  weightRecords: "weight records",
  healthEvents: "health events",
  vaccinations: "vaccinations",
  activities: "activities",
  tasks: "tasks",
  transactions: "transactions",
  knowledgeArticles: "knowledge articles",
  farmSettings: "settings",
};

/** "7 animals · 12 tasks · 10 transactions" — only non-zero counts. */
export function describeCounts(counts: BackupCounts): string {
  const parts = Object.entries(counts)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([k, v]) => `${v} ${COUNT_LABELS[k] ?? k}`);
  return parts.length > 0 ? parts.join(" · ") : "no records";
}

/** Trigger a client-side file download. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function todayFileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Shared PATCH /api/settings mutation — invalidates every query that depends
 * on settings (weather uses latitude/longitude, dashboard greets by name).
 */
export function usePatchSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<FarmSettingsData>) =>
      apiSend<FarmSettingsData>("/api/settings", "PATCH", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.settings });
      queryClient.invalidateQueries({ queryKey: qk.weather });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      queryClient.invalidateQueries({ queryKey: qk.summary });
    },
  });
}
