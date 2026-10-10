import { NextResponse } from "next/server";
import { isPushConfigured, broadcastPush } from "@/lib/push-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/test — send a test notification to every subscribed device.
 * Honest behaviour: requires configured VAPID keys and at least one
 * subscription; the browser must have granted notification permission.
 */
export async function POST() {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Push notifications are not configured on this server (missing VAPID keys in .env)." },
      { status: 501 }
    );
  }
  const result = await broadcastPush({
    title: "🔔 Farm Command test push",
    body: "Server-delivered reminders are working. Task and vaccination alerts will arrive like this.",
    tag: "farmcmd-push-test",
    url: "/",
  });
  if (result.sent === 0) {
    return NextResponse.json(
      { error: "No device received the test push. Subscribe this device first (and check notification permission)." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, sent: result.sent });
}
