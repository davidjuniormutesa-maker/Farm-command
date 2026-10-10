/**
 * Farm Command — local reminder engine.
 *
 * HONEST BEHAVIOUR (no fake background scheduling):
 * - Reminders are evaluated when the app is OPEN or actively used (on launch,
 *   on refocus, and every 60s while visible). This is a web platform truth:
 *   a PWA cannot guarantee alarms while fully closed, and we never claim to.
 * - When the device is ONLINE and Web Push is configured, the SERVER may
 *   additionally deliver reminders while the app is closed (see /api/push/*).
 * - Local reminders are stored in the farm database and never disappear
 *   because the server could not be reached.
 *
 * Dedupe: each (kind, record, due-date) notification is shown at most once
 * per ~20 hours, tracked in the `notifLog` table (IndexedDB).
 */

import { farmDb, nowIso, alive } from "./db";
import { daysUntil, startOfToday } from "@/lib/farm";
import { useSyncStore } from "./sync";

export interface DueReminder {
  kind: "task" | "vaccination";
  id: string;
  title: string;
  body: string;
  dueDate: string;
  priority: string;
  overdue: boolean;
}

export interface ReminderSettingsShape {
  notificationsEnabled: boolean;
  reminderLeadDays: number;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

/** Collect tasks/vaccinations that are due within the lead window or overdue. */
export async function collectDueReminders(settings: ReminderSettingsShape): Promise<DueReminder[]> {
  const lead = Number.isFinite(settings.reminderLeadDays) ? settings.reminderLeadDays : 3;
  const reminders: DueReminder[] = [];

  const tasks = (await farmDb.tasks.toArray()).filter(alive).filter((t) => t.status === "open");
  for (const t of tasks) {
    const days = daysUntil(t.dueDate);
    if (days === null) continue;
    const leadDays = Math.max(lead, t.leadTimeDays ?? 0);
    const withinWindow = days >= 0 && days <= leadDays;
    const isOverdue = days < 0;
    if (!withinWindow && !isOverdue) continue;
    const when = isOverdue ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}` : days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
    reminders.push({
      kind: "task",
      id: t.id,
      title: t.priority === "high" ? `🔴 ${t.title}` : t.title,
      body: `${when}${t.dueTime ? ` · ${t.dueTime}` : ""}`,
      dueDate: t.dueDate,
      priority: t.priority,
      overdue: isOverdue,
    });
  }

  const vaccinations = (await farmDb.vaccinations.toArray()).filter(alive).filter((v) => v.nextDueDate);
  for (const v of vaccinations) {
    const days = daysUntil(v.nextDueDate);
    if (days === null) continue;
    const withinWindow = days >= 0 && days <= lead;
    const isOverdue = days < 0;
    if (!withinWindow && !isOverdue) continue;
    const when = isOverdue ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}` : days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
    reminders.push({
      kind: "vaccination",
      id: v.id,
      title: `💉 ${v.vaccineName}`,
      body: `${when} — next vaccination due`,
      dueDate: v.nextDueDate!,
      priority: isOverdue ? "high" : "medium",
      overdue: isOverdue,
    });
  }

  // High priority first, then by due date
  reminders.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return Date.parse(a.dueDate) - Date.parse(b.dueDate);
  });
  return reminders;
}

function inQuietHours(settings: ReminderSettingsShape, now = new Date()): boolean {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const start = toMinutes(settings.quietHoursStart ?? "");
  const end = toMinutes(settings.quietHoursEnd ?? "");
  if (start == null || end == null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}

const DEDUPE_WINDOW_MS = 20 * 60 * 60 * 1000; // ~20 hours

async function wasRecentlyShown(key: string): Promise<boolean> {
  const row = await farmDb.notifLog.get(key);
  if (!row) return false;
  return Date.now() - Date.parse(row.shownAt) < DEDUPE_WINDOW_MS;
}

async function markShown(key: string): Promise<void> {
  await farmDb.notifLog.put({ id: key, shownAt: nowIso() });
}

/** Show one notification via the service worker (falls back to page Notification). */
export async function showNotification(title: string, options: NotificationOptions & { tag?: string }): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          ...options,
        });
        return true;
      }
    }
    new Notification(title, { icon: "/icons/icon-192.png", ...options });
    return true;
  } catch {
    return false;
  }
}

export interface EvaluateResult {
  reminders: DueReminder[];
  shown: number;
  skippedQuietHours: boolean;
}

/**
 * Evaluate reminders now (called on launch, refocus, every 60s, after sync).
 * Shows notifications for NEW due items and returns the full list so the UI
 * can render the in-app reminder centre regardless of notification permission.
 */
export async function evaluateReminders(force = false): Promise<EvaluateResult> {
  const empty: EvaluateResult = { reminders: [], shown: 0, skippedQuietHours: false };
  if (typeof window === "undefined") return empty;
  const { parseSettings } = await import("@/lib/settings-schema");
  const rows = await farmDb.settings.toArray();
  const map: Record<string, string> = {};
  for (const r of rows.filter(alive)) map[r.key] = r.value;
  const settings = parseSettings(map);

  const reminders = await collectDueReminders({
    notificationsEnabled: settings.notificationsEnabled,
    reminderLeadDays: settings.reminderLeadDays,
    quietHoursStart: settings.quietHoursStart ?? "20:00",
    quietHoursEnd: settings.quietHoursEnd ?? "06:00",
  });

  if (reminders.length === 0) return empty;
  if (!settings.notificationsEnabled && !force) return { ...empty, reminders };

  const quiet = inQuietHours(settings);
  if (quiet && !force) return { reminders, shown: 0, skippedQuietHours: true };

  let shown = 0;
  const today = startOfToday().toISOString().slice(0, 10);
  for (const r of reminders) {
    const dueDay = r.dueDate.slice(0, 10);
    const key = `${r.kind}:${r.id}:${r.overdue ? today : dueDay}`;
    // Overdue items re-notify daily; due items notify once per due date.
    if (!force && (await wasRecentlyShown(key))) continue;
    const ok = await showNotification(r.title, {
      body: r.body,
      tag: `farmcmd-${r.kind}-${r.id}`,
      data: { url: r.kind === "task" ? "/" : "/", kind: r.kind, id: r.id },
      requireInteraction: false,
      // Vibration for high-priority where the platform supports it
      // (Android Chrome; ignored elsewhere).
      ...(r.priority === "high" ? { vibrate: [200, 100, 200] } : {}),
    } as NotificationOptions);
    if (ok || !force) {
      await markShown(key);
      if (ok) shown++;
    }
  }
  return { reminders, shown, skippedQuietHours: quiet };
}

/** Fire a test notification immediately (ignores quiet hours + dedupe). */
export async function sendTestNotification(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, reason: "Notifications are not supported in this browser." };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, reason: "Notification permission has not been granted yet." };
  }
  const ok = await showNotification("🔔 Farm Command test reminder", {
    body: "Task and vaccination reminders will look like this. Sound and vibration follow your device settings.",
    tag: "farmcmd-test",
  });
  return ok ? { ok: true } : { ok: false, reason: "The browser blocked showing the notification." };
}

/** Start the reminder evaluation loop (launch + refocus + every 60s). */
let started = false;
export function initReminderEngine(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const run = () => {
    void evaluateReminders().catch(() => {});
  };
  // Small delay so the first paint is not competing with notification work.
  window.setTimeout(run, 4_000);
  window.setInterval(run, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") window.setTimeout(run, 1_500);
  });
}

/** Human summary used by the reminder centre UI. */
export function reminderSummary(reminders: DueReminder[]): string {
  if (reminders.length === 0) return "Nothing due — you are on top of the farm. 🎉";
  const overdue = reminders.filter((r) => r.overdue).length;
  const soon = reminders.length - overdue;
  const parts: string[] = [];
  if (overdue) parts.push(`${overdue} overdue`);
  if (soon) parts.push(`${soon} due soon`);
  return `${parts.join(" · ")} reminder${reminders.length === 1 ? "" : "s"}`;
}

// Re-export for convenience in UI components
export { useSyncStore };
