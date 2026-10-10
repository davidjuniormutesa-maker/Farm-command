import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { animalSchema, serializeAnimal } from "../_shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** GET /api/animals/[id] — one animal with its group name. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const animal = await db.animal.findUnique({
      where: { id },
      include: { group: { select: { name: true } } },
    });
    if (!animal) return NextResponse.json({ error: "Animal not found" }, { status: 404 });
    return NextResponse.json(serializeAnimal(animal));
  } catch (error) {
    console.error("GET /api/animals/[id] failed", error);
    return NextResponse.json({ error: "Failed to load animal" }, { status: 500 });
  }
}

/** PUT /api/animals/[id] — full update. Duplicate tagId against another animal → 409. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const parsed = animalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid animal data" },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const dup = await db.animal.findUnique({ where: { tagId: data.tagId }, select: { id: true } });
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: "An animal with this tag ID already exists" }, { status: 409 });
    }
    if (data.groupId) {
      const group = await db.livestockGroup.findUnique({ where: { id: data.groupId }, select: { id: true } });
      if (!group) return NextResponse.json({ error: "Selected group does not exist" }, { status: 400 });
    }

    const updated = await db.animal.update({
      where: { id },
      data,
      include: { group: { select: { name: true } } },
    });
    return NextResponse.json(serializeAnimal(updated));
  } catch (error) {
    if (isNotFound(error)) return NextResponse.json({ error: "Animal not found" }, { status: 404 });
    console.error("PUT /api/animals/[id] failed", error);
    return NextResponse.json({ error: "Failed to update animal" }, { status: 500 });
  }
}

/**
 * DELETE /api/animals/[id] — hard delete.
 * Health events, vaccinations and weight records cascade (schema onDelete: Cascade);
 * tasks/activities/transactions keep existing with animalId cleared (SetNull).
 * Open vaccination reminder tasks (no FK to Vaccination) are removed explicitly.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const vaccinations = await db.vaccination.findMany({ where: { animalId: id }, select: { id: true } });
    await db.task.deleteMany({
      where: { vaccinationId: { in: vaccinations.map((v) => v.id) }, status: "open" },
    });
    await db.animal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isNotFound(error)) return NextResponse.json({ error: "Animal not found" }, { status: 404 });
    console.error("DELETE /api/animals/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete animal" }, { status: 500 });
  }
}
