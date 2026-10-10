import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Keep in sync with ACCESS_COOKIE in src/middleware.ts.
const ACCESS_COOKIE = "fc_access";

const bodySchema = z.object({ token: z.string().min(1).max(500) });

/**
 * POST /api/unlock — exchange the shared access token for an httpOnly cookie.
 *
 * When `FARM_ACCESS_TOKEN` is unset the gate is disabled and this is a no-op
 * that simply reports success. Rate-limited to blunt brute-force guessing.
 */
export async function POST(req: Request) {
  const rl = rateLimit("unlock", clientIp(req), 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts — wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const token = process.env.FARM_ACCESS_TOKEN?.trim();
  if (!token) {
    // Gate disabled — nothing to unlock.
    return NextResponse.json({ ok: true, gateEnabled: false });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the farm access code." }, { status: 400 });
  }
  if (parsed.data.token !== token) {
    return NextResponse.json({ error: "Incorrect access code." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, gateEnabled: true });
  res.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // ~180 days
  });
  return res;
}
