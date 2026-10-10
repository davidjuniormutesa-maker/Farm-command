import { NextResponse } from "next/server";
import { seedFarmData, resetFarmData } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** POST /api/seed  { action: "seed" | "reset", withSettings?: boolean } */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "reset" ? "reset" : "seed";
    if (action === "reset") {
      await resetFarmData(Boolean(body?.withSettings));
      return NextResponse.json({ ok: true, action });
    }
    await seedFarmData();
    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("POST /api/seed failed", error);
    return NextResponse.json({ error: "Seed operation failed" }, { status: 500 });
  }
}
