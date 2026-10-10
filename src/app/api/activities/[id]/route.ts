import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ACTIVITY_TYPES } from "@/lib/farm";

export const dynamic = "force-dynamic";

/** Optional text: trims, "" → null */
const text = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => {
    const t = v?.trim();
    return t ? t : null;
  });

/** Optional positive number → number | null */
const positiveNumber = z
  .number()
  .positive("Cost must be a positive number")
  .optional()
  .nullable()
  .transform((v) => (typeof v === "number" && isFinite(v) ? v : null));

/** Required ISO date string → Date */
const requiredDate = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "A valid date is required")
  .transform((s) => new Date(s));

/** Optional FK string: "" → null */
const fk = z
  .string()
  .min(1)
  .optional()
  .nullable()
  .transform((v) => v || null);

const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES, { message: "Activity type is invalid" }),
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
  date: requiredDate,
  details: text,
  cost: positiveNumber,
  cropCycleId: fk,
  fieldId: fk,
  animalId: fk,
  groupId: fk,
});

/** Validate that any provided link ids actually exist. Returns an error message or null. */
async function linkError(data: {
  cropCycleId: string | null;
  fieldId: string | null;
  animalId: string | null;
  groupId: string | null;
}): Promise<string | null> {
  if (data.cropCycleId && !(await db.cropCycle.findUnique({ where: { id: data.cropCycleId } }))) {
    return "Linked crop cycle was not found";
  }
  if (data.fieldId && !(await db.field.findUnique({ where: { id: data.fieldId } }))) {
    return "Linked field was not found";
  }
  if (data.animalId && !(await db.animal.findUnique({ where: { id: data.animalId } }))) {
    return "Linked animal was not found";
  }
  if (data.groupId && !(await db.livestockGroup.findUnique({ where: { id: data.groupId } }))) {
    return "Linked livestock group was not found";
  }
  return null;
}

type Params = { params: Promise<{ id: string }> };

/** PUT /api/activities/[id] — full update. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.farmActivity.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    const parsed = activitySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid activity data" },
        { status: 400 }
      );
    }
    const linkErr = await linkError(parsed.data);
    if (linkErr) return NextResponse.json({ error: linkErr }, { status: 400 });

    const activity = await db.farmActivity.update({
      where: { id },
      data: parsed.data,
      include: {
        cropCycle: { select: { id: true, crop: true, variety: true } },
        field: { select: { id: true, name: true } },
        animal: { select: { id: true, tagId: true, name: true } },
        group: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(activity);
  } catch (error) {
    console.error("PUT /api/activities/[id] failed", error);
    return NextResponse.json({ error: "Failed to update activity" }, { status: 500 });
  }
}

/** DELETE /api/activities/[id]. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.farmActivity.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    await db.farmActivity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/activities/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete activity" }, { status: 500 });
  }
}
