import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { healthEventSchema, serializeHealthEvent } from "../_shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** PUT /api/health-events/[id] — full update of a timeline event. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
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
    const updated = await db.healthEvent.update({
      where: { id },
      data: { ...data, date: new Date(data.date) },
      include: {
        animal: { select: { tagId: true, name: true } },
        group: { select: { name: true } },
      },
    });
    return NextResponse.json(serializeHealthEvent(updated));
  } catch (error) {
    if (isNotFound(error)) return NextResponse.json({ error: "Health event not found" }, { status: 404 });
    console.error("PUT /api/health-events/[id] failed", error);
    return NextResponse.json({ error: "Failed to update health event" }, { status: 500 });
  }
}

/** DELETE /api/health-events/[id] — remove a timeline event. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await db.healthEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isNotFound(error)) return NextResponse.json({ error: "Health event not found" }, { status: 404 });
    console.error("DELETE /api/health-events/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete health event" }, { status: 500 });
  }
}
