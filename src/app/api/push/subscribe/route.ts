import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isPushConfigured } from "@/lib/push-server";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  userAgent: z.string().optional().nullable(),
});

/**
 * POST /api/push/subscribe — store this device's push subscription.
 * Idempotent: re-subscribing the same endpoint updates it (no duplicates).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isPushConfigured()) {
      return NextResponse.json(
        { error: "Push notifications are not configured on this server (missing VAPID keys)." },
        { status: 501 }
      );
    }
    const parsed = subscribeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
    }
    const { subscription, userAgent } = parsed.data;
    await db.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent: userAgent ?? null },
      create: {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/push/subscribe failed", error);
    return NextResponse.json({ error: "Could not save the push subscription" }, { status: 500 });
  }
}
