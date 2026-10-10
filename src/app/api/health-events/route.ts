import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { healthEventSchema, serializeHealthEvent } from "./_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/health-events — health/lifecycle timeline events (newest first).
 * Optional filters: ?animalId=<id>, ?groupId=<id>. Without filters returns all events.
 * Each event includes animal {tagId, name} and group {name} for display.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const animalId = params.get("animalId") ?? undefined;
    const groupId = params.get("groupId") ?? undefined;

    const events = await db.healthEvent.findMany({
      where: {
        deletedAt: null,
        ...(animalId ? { animalId } : {}),
        ...(groupId ? { groupId } : {}),
      },
      include: {
        animal: { select: { tagId: true, name: true } },
        group: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(events.map(serializeHealthEvent));
  } catch (error) {
    console.error("GET /api/health-events failed", error);
    return NextResponse.json({ error: "Failed to load health events" }, { status: 500 });
  }
}

/** POST /api/health-events — record an observation/treatment/visit/etc. for an animal or a group. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = healthEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid health event data" },
        { status: 400 }
      );
    }
    const data = parsed.data;
    if (!data.animalId && !data.groupId) {
      return NextResponse.json({ error: "Select an animal or a group for this record" }, { status: 400 });
    }

    const created = await db.healthEvent.create({
      data: { ...data, date: new Date(data.date) },
      include: {
        animal: { select: { tagId: true, name: true } },
        group: { select: { name: true } },
      },
    });
    return NextResponse.json(serializeHealthEvent(created), { status: 201 });
  } catch (error) {
    console.error("POST /api/health-events failed", error);
    return NextResponse.json({ error: "Failed to record health event" }, { status: 500 });
  }
}
