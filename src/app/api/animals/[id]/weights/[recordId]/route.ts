import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; recordId: string }> };

/**
 * DELETE /api/animals/[id]/weights/[recordId] — remove one measurement.
 * If the deleted record was the animal's newest, the headline weightKg
 * is re-synced to the remaining latest record (or cleared when none left).
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id, recordId } = await ctx.params;
    const record = await db.weightRecord.findUnique({ where: { id: recordId } });
    if (!record || record.animalId !== id) {
      return NextResponse.json({ error: "Weight record not found" }, { status: 404 });
    }

    const animal = await db.animal.findUnique({ where: { id }, select: { id: true } });
    if (!animal) return NextResponse.json({ error: "Animal not found" }, { status: 404 });

    // Was the deleted record the newest one before removal?
    const latestBefore = await db.weightRecord.findFirst({
      where: { animalId: id },
      orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });

    await db.weightRecord.delete({ where: { id: recordId } });

    let animalWeightKg: number | null = null;
    if (latestBefore?.id === recordId) {
      const nextLatest = await db.weightRecord.findFirst({
        where: { animalId: id },
        orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
        select: { weightKg: true },
      });
      const updated = await db.animal.update({
        where: { id },
        data: { weightKg: nextLatest?.weightKg ?? null },
        select: { weightKg: true },
      });
      animalWeightKg = updated.weightKg;
    }

    return NextResponse.json({ ok: true, animalWeightKg });
  } catch (error) {
    console.error("DELETE /api/animals/[id]/weights/[recordId] failed", error);
    return NextResponse.json({ error: "Failed to delete weight record" }, { status: 500 });
  }
}
