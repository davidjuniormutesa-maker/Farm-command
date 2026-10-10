import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { serializeVaccination, updateVaccinationWithReminder, vaccinationSchema } from "../_shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/**
 * PUT /api/vaccinations/[id] — full update.
 * The linked reminder task (matched by vaccinationId) is re-synced:
 * nextDueDate changed → task dueDate/title/priority updated; nextDueDate removed → open task deleted.
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const parsed = vaccinationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid vaccination data" },
        { status: 400 }
      );
    }
    const data = parsed.data;
    if (!data.animalId && !data.groupId) {
      return NextResponse.json({ error: "Select an animal or a group for this record" }, { status: 400 });
    }

    const updated = await updateVaccinationWithReminder(id, {
      animalId: data.animalId,
      groupId: data.groupId,
      vaccineName: data.vaccineName,
      dateGiven: new Date(data.dateGiven),
      nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : null,
      batchNumber: data.batchNumber,
      administeredBy: data.administeredBy,
      notes: data.notes,
    });
    if (!updated) return NextResponse.json({ error: "Vaccination not found" }, { status: 404 });
    return NextResponse.json(serializeVaccination(updated));
  } catch (error) {
    if (isNotFound(error)) return NextResponse.json({ error: "Vaccination not found" }, { status: 404 });
    console.error("PUT /api/vaccinations/[id] failed", error);
    return NextResponse.json({ error: "Failed to update vaccination" }, { status: 500 });
  }
}

/**
 * DELETE /api/vaccinations/[id] — remove the record.
 * Task has no FK to Vaccination (vaccinationId is a plain string column),
 * so the still-open reminder task is deleted explicitly first.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    await db.task.deleteMany({ where: { vaccinationId: id, status: "open" } });
    await db.vaccination.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isNotFound(error)) return NextResponse.json({ error: "Vaccination not found" }, { status: 404 });
    console.error("DELETE /api/vaccinations/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete vaccination" }, { status: 500 });
  }
}
