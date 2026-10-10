import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isPushConfigured, broadcastPush } from "@/lib/push-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/check — server-side reminder evaluation + Web Push delivery.
 *
 * Called opportunistically by the client after each sync, and safe to call
 * from an external cron (curl -X POST https://host/api/push/check). For every
 * due/overdue open task and vaccination next-due date within the lead window,
 * one push is sent per unique (kind, record, due-date) — the PushLog table
 * de-duplicates so retries never spam the farmer.
 *
 * HONEST LIMITATION: this only reaches devices that are online from the
 * server's perspective. When a device is offline, its LOCAL reminder engine
 * still evaluates and shows due reminders when the app is opened/active.
 */
export async function POST() {
  try {
    if (!isPushConfigured()) {
      return NextResponse.json({ ok: false, reason: "push-not-configured", sent: 0 });
    }

    const settingsRows = await db.farmSetting.findMany();
    const map: Record<string, string> = {};
    for (const row of settingsRows) map[row.key] = row.value;
    const lead = Number.isFinite(Number(map.reminderLeadDays)) ? Math.max(0, Number(map.reminderLeadDays)) : 3;

    const now = Date.now();
    const windowEnd = now + lead * 86_400_000;
    const due: { kind: string; recordId: string; title: string; body: string; dueDate: string }[] = [];

    const openTasks = await db.task.findMany({ where: { status: "open" } });
    for (const t of openTasks) {
      const dueTime = t.dueDate.getTime();
      if (dueTime > windowEnd) continue;
      due.push({
        kind: "task",
        recordId: t.id,
        title: t.title,
        body: dueTime < now ? "This task is overdue." : "Task due today.",
        dueDate: t.dueDate.toISOString().slice(0, 10),
      });
    }

    const vaccinations = await db.vaccination.findMany({ where: { nextDueDate: { not: null } } });
    for (const v of vaccinations) {
      const dueTime = v.nextDueDate!.getTime();
      if (dueTime > windowEnd) continue;
      due.push({
        kind: "vaccination",
        recordId: v.id,
        title: `💉 ${v.vaccineName}`,
        body: dueTime < now ? "Vaccination is overdue." : "Vaccination due soon.",
        dueDate: v.nextDueDate!.toISOString().slice(0, 10),
      });
    }

    let sent = 0;
    for (const item of due) {
      const log = await db.pushLog.findUnique({
        where: { kind_recordId_dueDate: { kind: item.kind, recordId: item.recordId, dueDate: item.dueDate } },
      });
      if (log) continue; // already pushed for this due-date
      const result = await broadcastPush({
        title: item.title,
        body: item.body,
        tag: `farmcmd-${item.kind}-${item.recordId}`,
        url: "/",
      });
      if (result.sent > 0) {
        await db.pushLog.create({ data: { kind: item.kind, recordId: item.recordId, dueDate: item.dueDate } });
        sent += result.sent;
      }
    }

    return NextResponse.json({ ok: true, evaluated: due.length, sent });
  } catch (error) {
    console.error("POST /api/push/check failed", error);
    return NextResponse.json({ error: "Push check failed" }, { status: 500 });
  }
}
