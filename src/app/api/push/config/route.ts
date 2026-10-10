import { NextResponse } from "next/server";
import { isPushConfigured, publicKey } from "@/lib/push-server";

export const dynamic = "force-dynamic";

/** GET /api/push/config — public VAPID key for pushManager.subscribe(), or configured:false. */
export async function GET() {
  if (!isPushConfigured()) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({ configured: true, publicKey: publicKey() });
}
