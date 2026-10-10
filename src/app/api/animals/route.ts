import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { animalSchema, serializeAnimal } from "./_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/animals — list all animals with their group name.
 * Optional server-side filters: ?status=active|sold|deceased|archived, ?species=Cattle…, ?groupId=<id>
 * (The livestock UI also filters client-side; these params support targeted queries, e.g. group detail.)
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const status = params.get("status") ?? undefined;
    const species = params.get("species") ?? undefined;
    const groupId = params.get("groupId") ?? undefined;

    const animals = await db.animal.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(species ? { species } : {}),
        ...(groupId ? { groupId } : {}),
      },
      include: { group: { select: { name: true } } },
      orderBy: { tagId: "asc" },
    });

    return NextResponse.json(animals.map(serializeAnimal));
  } catch (error) {
    console.error("GET /api/animals failed", error);
    return NextResponse.json({ error: "Failed to load animals" }, { status: 500 });
  }
}

/** POST /api/animals — create an animal. Duplicate tagId → 409. */
export async function POST(req: NextRequest) {
  try {
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
    if (dup) {
      return NextResponse.json({ error: "An animal with this tag ID already exists" }, { status: 409 });
    }
    if (data.groupId) {
      const group = await db.livestockGroup.findUnique({ where: { id: data.groupId }, select: { id: true } });
      if (!group) return NextResponse.json({ error: "Selected group does not exist" }, { status: 400 });
    }

    const created = await db.animal.create({
      data,
      include: { group: { select: { name: true } } },
    });
    return NextResponse.json(serializeAnimal(created), { status: 201 });
  } catch (error) {
    console.error("POST /api/animals failed", error);
    return NextResponse.json({ error: "Failed to create animal" }, { status: 500 });
  }
}
