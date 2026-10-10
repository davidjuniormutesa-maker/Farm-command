import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

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

/** Optional positive number: null/undefined → null */
const positiveNumber = z
  .number()
  .positive("Must be a positive number")
  .optional()
  .nullable()
  .transform((v) => (typeof v === "number" && isFinite(v) ? v : null));

const fieldSchema = z.object({
  name: z.string().trim().min(1, "Field name is required").max(120, "Field name is too long"),
  areaHa: positiveNumber,
  location: text,
  soilNotes: text,
  irrigation: text,
  notes: text,
});

/** GET /api/fields — all fields with their active (planned/growing) crop cycles. */
export async function GET() {
  try {
    const fields = await db.field.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        cropCycles: {
          where: { status: { in: ["planned", "growing"] } },
          select: {
            id: true,
            crop: true,
            variety: true,
            status: true,
            plantingDate: true,
            expectedHarvestDate: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    return NextResponse.json(fields);
  } catch (error) {
    console.error("GET /api/fields failed", error);
    return NextResponse.json({ error: "Failed to load fields" }, { status: 500 });
  }
}

/** POST /api/fields — create a field. */
export async function POST(req: NextRequest) {
  try {
    const parsed = fieldSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid field data" },
        { status: 400 }
      );
    }
    const field = await db.field.create({ data: parsed.data });
    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    console.error("POST /api/fields failed", error);
    return NextResponse.json({ error: "Failed to create field" }, { status: 500 });
  }
}
