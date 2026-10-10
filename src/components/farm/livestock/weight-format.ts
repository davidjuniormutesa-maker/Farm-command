"use client";

/** Tiny date-format helpers for the weight chart (kept local to the livestock module). */

/** "18 Sep 2026" style short date. */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Weekday + short date, e.g. "Fri 18 Sep 2026". */
export function formatDotw(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
