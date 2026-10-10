import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createVaccinationWithReminder, serializeVaccination, vaccinationSchema } from "./_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/vaccinations — vaccination records (newest first), each with
 * animal {tagId, name} and group {name}. Optional filters: ?animalId=<id>, ?groupId=<id>.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const animalId = params.get("animalId") ?? undefined;
    const groupId = params.get("groupId") ?? undefined;

    const vaccinations = await db.vaccination.findMany({
      where: {
        deletedAt: null,
        ...(animalId ? { animalId } : {}),
        ...(groupId ? { groupId } : {}),
      },
      include: {
        animal: { select: { tagId: true, name: true } },
        group: { select: { name: true } },
      },
      orderBy: { dateGiven: "desc" },
    });
    return NextResponse.json(vaccinations.map(serializeVaccination));
  } catch (error) {
    console.error("GET /api/vaccinations failed", error);
    return NextResponse.json({ error: "Failed to load vaccinations" }, { status: 500 });
  }
}

/**
 * POST /api/vaccinations — record a vaccination.
 * If nextDueDate is set, a high/medium priority Task reminder (category "health")
 * is created automatically and its id stored on the vaccination (reminderTaskId).
 */
export async function POST(req: NextRequest) {
  try {
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

    const created = await createVaccinationWithReminder({
      animalId: data.animalId,
      groupId: data.groupId,
      vaccineName: data.vaccineName,
      dateGiven: new Date(data.dateGiven),
      nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : null,
      batchNumber: data.batchNumber,
      administeredBy: data.administeredBy,
      notes: data.notes,
    });
    return NextResponse.json(serializeVaccination(created), { status: 201 });
  } catch (error) {
    console.error("POST /api/vaccinations failed", error);
    return NextResponse.json({ error: "Failed to record vaccination" }, { status: 500 });
  }
}
