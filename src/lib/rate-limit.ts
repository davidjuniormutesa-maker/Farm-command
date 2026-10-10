/**
 * Farm Command — tiny in-memory rate limiter.
 *
 * Fixed-window counter keyed by (bucket + client). Designed for the
 * single-server, self-hosted deployment this app targets: it protects the
 * expensive/abusable endpoints (AI, sync) from being hammered without adding
 * an external dependency like Redis.
 *
 * NOTE: state lives in the Node process, so on a multi-instance deployment the
 * effective limit is per-instance. That is an accepted trade-off for the
 * self-hosted single-server model; put a reverse proxy / WAF in front if you
 * run multiple instances.
 */

interface Counter {
  count: number;
  resetAt: number;
}

const store = new Map<string, Counter>();
let lastSweep = 0;

function sweep(now: number) {
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, c] of store) {
    if (c.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Requests still allowed in the current window. */
  remaining: number;
  /** Seconds until the window resets (useful for a Retry-After header). */
  retryAfter: number;
}

/**
 * @param bucket   logical name for the limited resource, e.g. "ai", "sync-push"
 * @param client   caller identity (IP address, or "unknown")
 * @param limit    max requests per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(
  bucket: string,
  client: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const key = `${bucket}:${client}`;
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, retryAfter: 0 };
}

/** Best-effort client IP from the standard proxy headers. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
