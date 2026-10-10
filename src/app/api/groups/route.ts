import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { groupSchema, serializeGroup } from "./_shared";

export const dynamic = "force-dynamic";

/** GET /api/groups — list all herds/flocks. Optional filter: ?status=active|archived */
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const groups = await db.livestockGroup.findMany({
      where: { ...(status ? { status } : {}), deletedAt: null },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(groups.map(serializeGroup));
  } catch (error) {
    console.error("GET /api/groups failed", error);
    return NextResponse.json({ error: "Failed to load groups" }, { status: 500 });
  }
}

/** POST /api/groups — create a herd/flock. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = groupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid group data" },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const created = await db.livestockGroup.create({
      data: { ...data, status: data.status ?? "active" },
    });
    return NextResponse.json(serializeGroup(created), { status: 201 });
  } catch (error) {
    console.error("POST /api/groups failed", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
