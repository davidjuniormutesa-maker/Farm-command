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

type Params = { params: Promise<{ id: string }> };

/** PUT /api/fields/[id] — full update. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.field.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }
    const parsed = fieldSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid field data" },
        { status: 400 }
      );
    }
    const field = await db.field.update({ where: { id }, data: parsed.data });
    return NextResponse.json(field);
  } catch (error) {
    console.error("PUT /api/fields/[id] failed", error);
    return NextResponse.json({ error: "Failed to update field" }, { status: 500 });
  }
}

/** DELETE /api/fields/[id] — linked crop cycles are kept (fieldId set to null). */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await db.field.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Field not found" }, { status: 404 });
    }
    await db.field.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/fields/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete field" }, { status: 500 });
  }
}
