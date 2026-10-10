import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Date is invalid")
  .refine((v) => Date.parse(v) <= Date.now() + 24 * 60 * 60 * 1000, "Date cannot be in the future");

const createSchema = z.object({
  weightKg: z.coerce
    .number({ message: "Weight is required" })
    .positive("Weight must be greater than zero")
    .max(20000, "Weight looks too large"),
  recordedAt: isoDate.optional(),
  note: z.string().trim().max(300, "Note is too long (max 300 characters)").optional().or(z.literal("")),
});

function serializeRecord(r: { id: string; animalId: string; weightKg: number; recordedAt: Date; note: string | null }) {
  return { id: r.id, animalId: r.animalId, weightKg: r.weightKg, recordedAt: r.recordedAt.toISOString(), note: r.note };
}

/** GET /api/animals/[id]/weights — full weight history (oldest → newest) + animal summary. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const animal = await db.animal.findUnique({
      where: { id },
      select: { id: true, tagId: true, name: true, weightKg: true },
    });
    if (!animal) return NextResponse.json({ error: "Animal not found" }, { status: 404 });

    const records = await db.weightRecord.findMany({
      where: { animalId: id },
      orderBy: { recordedAt: "asc" },
    });

    return NextResponse.json({
      animal: { id: animal.id, tagId: animal.tagId, name: animal.name, weightKg: animal.weightKg },
      records: records.map(serializeRecord),
    });
  } catch (error) {
    console.error("GET /api/animals/[id]/weights failed", error);
    return NextResponse.json({ error: "Failed to load weight history" }, { status: 500 });
  }
}

/**
 * POST /api/animals/[id]/weights — record a weight measurement.
 * When the new record is the newest (or the first), the animal's current
 * weightKg is updated to match, so cards/lists stay in sync.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const animal = await db.animal.findUnique({ where: { id }, select: { id: true } });
    if (!animal) return NextResponse.json({ error: "Animal not found" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid weight record" },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const recordedAt = data.recordedAt ? new Date(data.recordedAt) : new Date();

    const latest = await db.weightRecord.findFirst({
      where: { animalId: id },
      orderBy: { recordedAt: "desc" },
      select: { recordedAt: true },
    });

    const record = await db.weightRecord.create({
      data: {
        animalId: id,
        weightKg: data.weightKg,
        recordedAt,
        note: data.note && data.note.trim() !== "" ? data.note.trim() : null,
      },
    });

    // Keep the animal's headline weight in sync with the newest measurement.
    let animalWeightKg: number | null = null;
    if (!latest || record.recordedAt >= latest.recordedAt) {
      const updated = await db.animal.update({
        where: { id },
        data: { weightKg: data.weightKg },
        select: { weightKg: true },
      });
      animalWeightKg = updated.weightKg;
    } else {
      // Back-dated entry: report the unchanged headline weight.
      const current = await db.animal.findUnique({ where: { id }, select: { weightKg: true } });
      animalWeightKg = current?.weightKg ?? null;
    }

    return NextResponse.json(
      { record: serializeRecord(record), animalWeightKg },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/animals/[id]/weights failed", error);
    return NextResponse.json({ error: "Failed to record weight" }, { status: 500 });
  }
}
