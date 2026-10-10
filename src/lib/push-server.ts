/**
 * Farm Command — Web Push (server side).
 *
 * Uses the VAPID keys from environment variables. When they are not
 * configured, push features degrade honestly: the config endpoint reports
 * `configured: false` and the UI says push notifications are not set up
 * instead of pretending they work.
 */

import webpush from "web-push";

let configured: boolean | null = null;

export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.WEB_PUSH_PUBLIC_KEY;
  const priv = process.env.WEB_PUSH_PRIVATE_KEY;
  configured = Boolean(pub && priv);
  if (configured) {
    try {
      webpush.setVapidDetails(
        process.env.WEB_PUSH_CONTACT ?? "mailto:farm-command@example.com",
        pub as string,
        priv as string
      );
    } catch {
      configured = false;
    }
  }
  return configured;
}

export function publicKey(): string | null {
  if (!isPushConfigured()) return null;
  return process.env.WEB_PUSH_PUBLIC_KEY ?? null;
}

/** Send a push to a subscription; returns false when the subscription is gone. */
export async function sendPush(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}, payload: Record<string, unknown>): Promise<"ok" | "gone" | "failed"> {
  if (!isPushConfigured()) return "failed";
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload)
    );
    return "ok";
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) return "gone";
    return "failed";
  }
}

/** Fire-and-forget push to every stored subscription. Cleans up dead ones. */
export async function broadcastPush(payload: Record<string, unknown>): Promise<{ sent: number; removed: number }> {
  if (!isPushConfigured()) return { sent: 0, removed: 0 };
  const { db } = await import("@/lib/db");
  const subs = await db.pushSubscription.findMany();
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      if (result === "ok") sent++;
      else if (result === "gone") {
        await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        removed++;
      }
    })
  );
  return { sent, removed };
}
