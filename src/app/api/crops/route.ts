import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const CROP_STATUSES = ["planned", "growing", "harvested", "ended"] as const;

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

/** Optional ISO date string → Date | null */
const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid date")
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));

/** Optional FK string: "" → null */
const fk = z
  .string()
  .min(1)
  .optional()
  .nullable()
  .transform((v) => v || null);

const cropCycleSchema = z
  .object({
    crop: z.string().trim().min(1, "Crop is required").max(120, "Crop name is too long"),
    variety: text,
    fieldId: fk,
    plantingDate: isoDate,
    expectedHarvestDate: isoDate,
    seedDetails: text,
    status: z.enum(CROP_STATUSES).optional().nullable(),
    notes: text,
  })
  .refine(
    (d) =>
      !d.plantingDate || !d.expectedHarvestDate || d.expectedHarvestDate.getTime() >= d.plantingDate.getTime(),
    { message: "Expected harvest date must be on or after the planting date", path: ["expectedHarvestDate"] }
  );

/**
 * Auto-status: when no status is given, a cycle with a planting date becomes
 * "growing" (or "planned" if the planting date is still in the future).
 */
function deriveStatus(status: string | null | undefined, plantingDate: Date | null): string {
  if (status) return status;
  if (plantingDate) return plantingDate.getTime() > Date.now() ? "planned" : "growing";
  return "planned";
}

/** GET /api/crops — all crop cycles with their field name. */
export async function GET() {
  try {
    const crops = await db.cropCycle.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { field: { select: { id: true, name: true } } },
    });
    return NextResponse.json(crops);
  } catch (error) {
    console.error("GET /api/crops failed", error);
    return NextResponse.json({ error: "Failed to load crop cycles" }, { status: 500 });
  }
}

/** POST /api/crops — create a crop cycle (status auto-derived when omitted). */
export async function POST(req: NextRequest) {
  try {
    const parsed = cropCycleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid crop cycle data" },
        { status: 400 }
      );
    }
    const data = parsed.data;
    if (data.fieldId && !(await db.field.findUnique({ where: { id: data.fieldId } }))) {
      return NextResponse.json({ error: "Selected field was not found" }, { status: 400 });
    }
    const crop = await db.cropCycle.create({
      data: {
        crop: data.crop,
        variety: data.variety,
        fieldId: data.fieldId,
        plantingDate: data.plantingDate,
        expectedHarvestDate: data.expectedHarvestDate,
        seedDetails: data.seedDetails,
        notes: data.notes,
        status: deriveStatus(data.status, data.plantingDate),
      },
      include: { field: { select: { id: true, name: true } } },
    });
    return NextResponse.json(crop, { status: 201 });
  } catch (error) {
    console.error("POST /api/crops failed", error);
    return NextResponse.json({ error: "Failed to create crop cycle" }, { status: 500 });
  }
}
