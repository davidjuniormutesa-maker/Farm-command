import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MAP_KINDS = ["field", "paddock", "building", "water", "gate", "road", "other"] as const;

const updateSchema = z.object({
  kind: z.enum(MAP_KINDS).optional(),
  label: z.string().trim().min(1).max(60).optional(),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
  w: z.number().min(2).max(100).optional(),
  h: z.number().min(2).max(100).optional(),
  color: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

/** PUT /api/map/[id] — move/resize/relabel a layout item. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid map item";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const existing = await db.farmMapItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Map item not found" }, { status: 404 });
    const item = await db.farmMapItem.update({ where: { id }, data: parsed.data });
    return NextResponse.json(item);
  } catch (error) {
    console.error("PUT /api/map/[id] failed", error);
    return NextResponse.json({ error: "Failed to update map item" }, { status: 500 });
  }
}

/** DELETE /api/map/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await db.farmMapItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Map item not found" }, { status: 404 });
    await db.farmMapItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/map/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete map item" }, { status: 500 });
  }
}
