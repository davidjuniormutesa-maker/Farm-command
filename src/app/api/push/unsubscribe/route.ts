import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/push/unsubscribe { endpoint } — remove this device's subscription. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
    if (!body?.endpoint) {
      return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
    }
    await db.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/push/unsubscribe failed", error);
    return NextResponse.json({ error: "Could not remove the push subscription" }, { status: 500 });
  }
}
