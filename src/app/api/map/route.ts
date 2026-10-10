import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MAP_KINDS = ["field", "paddock", "building", "water", "gate", "road", "other"] as const;

const itemSchema = z.object({
  kind: z.enum(MAP_KINDS),
  label: z.string().trim().min(1, "Label is required").max(60),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(2).max(100),
  h: z.number().min(2).max(100),
  color: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

/** GET /api/map — all layout items sorted for stable rendering. */
export async function GET() {
  try {
    const items = await db.farmMapItem.findMany({ where: { deletedAt: null }, orderBy: [{ createdAt: "asc" }] });
    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/map failed", error);
    return NextResponse.json({ error: "Failed to load farm map" }, { status: 500 });
  }
}

/** POST /api/map — create a layout item. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = itemSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid map item";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const item = await db.farmMapItem.create({ data: parsed.data });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST /api/map failed", error);
    return NextResponse.json({ error: "Failed to create map item" }, { status: 500 });
  }
}
