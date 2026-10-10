import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/rainfall            → all daily readings, newest first
 * GET /api/rainfall?year=2026  → readings within that calendar year
 *
 * Alongside the raw rows, the payload carries honest roll-ups used by the
 * dashboard weather card and the calendar:
 *  - today            → today's reading, if any
 *  - last7 / last30   → totals over the trailing windows
 *  - last12Months     → total over the trailing year (rain-season proxy)
 *  - lastRain         → most recent day with mm > 0
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const yearParam = Number(searchParams.get("year"));

    const where =
      Number.isInteger(yearParam) && yearParam > 1970
        ? {
            date: {
              gte: new Date(yearParam, 0, 1),
              lt: new Date(yearParam + 1, 0, 1),
            },
          }
        : undefined;

    const rows = await db.rainfallLog.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { date: "desc" },
      take: 400,
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysAgoDate = (days: number) => {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - days);
      return d;
    };
    const last7Start = daysAgoDate(6);
    const last30Start = daysAgoDate(29);
    const yearAgoStart = daysAgoDate(364);

    let today: number | null = null;
    let last7 = 0;
    let last30 = 0;
    let last12Months = 0;
    let lastRain: { date: string; mm: number } | null = null;

    for (const r of rows) {
      const d = new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate());
      if (d.getTime() === startOfToday.getTime()) today = r.mm;
      if (d >= last7Start) last7 += r.mm;
      if (d >= last30Start) last30 += r.mm;
      if (d >= yearAgoStart) last12Months += r.mm;
      if (r.mm > 0 && !lastRain) {
        lastRain = { date: r.date.toISOString(), mm: r.mm };
      }
    }

    return NextResponse.json({
      readings: rows.map((r) => ({
        id: r.id,
        date: r.date.toISOString(),
        mm: r.mm,
        note: r.note,
      })),
      today,
      last7,
      last30,
      last12Months,
      lastRain,
    });
  } catch (error) {
    console.error("GET /api/rainfall failed", error);
    return NextResponse.json({ error: "Failed to load rainfall records" }, { status: 500 });
  }
}

const upsertSchema = z.object({
  date: z
    .string({ message: "Date is required" })
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" }),
  mm: z
    .number({ message: "Rainfall amount is required" })
    .min(0, "Rainfall cannot be negative")
    .max(500, "That rainfall amount looks too high — please check the value"),
  note: z.string().max(200, "Note must be 200 characters or fewer").optional().nullable(),
});

/**
 * POST /api/rainfall — log (or overwrite) the reading for one calendar day.
 * One record per day: posting again for the same date replaces the amount.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid rainfall data" },
        { status: 400 }
      );
    }
    const { date, mm, note } = parsed.data;
    const day = new Date(date);
    day.setHours(12, 0, 0, 0); // normalise to midday local to dodge TZ edge cases

    const saved = await db.rainfallLog.upsert({
      where: { date: day },
      create: { date: day, mm, note: note?.trim() || null },
      update: { mm, note: note?.trim() || null },
    });

    return NextResponse.json(
      { id: saved.id, date: saved.date.toISOString(), mm: saved.mm, note: saved.note },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/rainfall failed", error);
    return NextResponse.json({ error: "Failed to save the rainfall record" }, { status: 500 });
  }
}
