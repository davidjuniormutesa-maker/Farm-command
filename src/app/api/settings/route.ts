import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/settings-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.farmSetting.findMany();
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;
    return NextResponse.json(parseSettings(map));
  } catch (error) {
    console.error("GET /api/settings failed", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const current = parseSettings(
      Object.fromEntries((await db.farmSetting.findMany()).map((r) => [r.key, r.value]))
    );
    const merged: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...current, ...body })) {
      if (key in DEFAULT_SETTINGS) {
        // Structured values (e.g. the expenseBudgets record) are stored as JSON
        // strings; re-merging an already-parsed object must re-stringify it.
        merged[key] =
          typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
      }
    }
    const ops = Object.entries(merged).map(([key, value]) =>
      db.farmSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
    );
    await db.$transaction(ops);
    return NextResponse.json(parseSettings(merged));
  } catch (error) {
    console.error("PATCH /api/settings failed", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
