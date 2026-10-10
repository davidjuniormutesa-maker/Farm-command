/**
 * Farm Command — Web Push (client side).
 *
 * Subscribes the browser to push notifications via the service worker and
 * registers the subscription with the Farm Command server. Honest behaviour:
 * requires (a) browser support, (b) notification permission, (c) a server
 * with VAPID keys configured. Every failure mode reports a readable reason.
 */

export interface PushStatus {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  configured: boolean; // server has VAPID keys
  subscribed: boolean;
  endpoint: string | null;
}

export async function urlBase64ToUint8Array(base64String: string): Promise<Uint8Array> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function currentRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready.catch(() => null));
}

export async function getPushStatus(): Promise<PushStatus> {
  const unsupported: PushStatus = {
    supported: false, permission: "unsupported", configured: false, subscribed: false, endpoint: null,
  };
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return unsupported;
  }
  let configured = false;
  try {
    const res = await fetch("/api/push/config", { cache: "no-store" });
    const data = await res.json();
    configured = Boolean(data?.configured);
  } catch {
    configured = false;
  }
  const reg = await currentRegistration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  return {
    supported: true,
    permission: "Notification" in window ? Notification.permission : "unsupported",
    configured,
    subscribed: Boolean(sub),
    endpoint: sub?.endpoint ?? null,
  };
}

export interface SubscribeResult {
  ok: boolean;
  reason?: string;
  status?: PushStatus;
}

/** Subscribe this device to server push (asks notification permission first if needed). */
export async function subscribeToPush(): Promise<SubscribeResult> {
  const status0 = await getPushStatus();
  if (!status0.supported) {
    return { ok: false, reason: "This browser does not support push notifications.", status: status0 };
  }
  if (!status0.configured) {
    return { ok: false, reason: "Push is not configured on this server yet (missing VAPID keys). Local reminders still work.", status: status0 };
  }

  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      return { ok: false, reason: "Notification permission was not granted.", status: await getPushStatus() };
    }
  } else if (Notification.permission === "denied") {
    return {
      ok: false,
      reason: "Notifications are blocked for this site. Enable them in your browser's site settings, then try again.",
      status: await getPushStatus(),
    };
  }

  const reg = await currentRegistration();
  if (!reg) return { ok: false, reason: "The service worker is not ready yet — try again in a moment." };

  const configRes = await fetch("/api/push/config", { cache: "no-store" });
  const config = await configRes.json();
  const vapidKey = config?.publicKey as string | undefined;
  if (!vapidKey) return { ok: false, reason: "Push is not configured on this server (missing VAPID keys)." };

  try {
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: (await urlBase64ToUint8Array(vapidKey)) as BufferSource,
      }));

    const body = {
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: arrayBufferToBase64(sub.toJSON().keys?.p256dh), auth: arrayBufferToBase64(sub.toJSON().keys?.auth) },
      },
      userAgent: navigator.userAgent,
    };
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false, reason: data?.error ?? "The server rejected the subscription." };
    }
    return { ok: true, status: await getPushStatus() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription failed";
    return { ok: false, reason: message };
  }
}

function arrayBufferToBase64(value?: string): string {
  return value ?? "";
}

/** Unsubscribe this device from server push. */
export async function unsubscribeFromPush(): Promise<SubscribeResult> {
  const reg = await currentRegistration();
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (sub) {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return { ok: true, status: await getPushStatus() };
}
