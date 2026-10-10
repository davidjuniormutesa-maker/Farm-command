import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Farm Command — optional access gate (OFF by default).
 *
 * The app is offline-first and account-free by design. But when you host the
 * sync server on the public internet, every /api route is otherwise reachable
 * by anyone who knows the URL. Setting a single shared secret in the
 * `FARM_ACCESS_TOKEN` environment variable turns on a lightweight gate:
 *
 *   - Browsers unlock once via /unlock (sets an httpOnly cookie), after which
 *     every page load and same-origin API fetch carries the cookie
 *     automatically — no per-user accounts, matching the product's promise.
 *   - Programmatic callers (e.g. the push cron) can send
 *     `Authorization: Bearer <FARM_ACCESS_TOKEN>` instead.
 *
 * When `FARM_ACCESS_TOKEN` is unset (the default), this middleware is a no-op
 * and the app behaves exactly as before.
 */

export const ACCESS_COOKIE = "fc_access";

// Paths that must stay reachable even when locked (the unlock flow itself and
// the assets the browser needs to render the app shell / service worker).
const PUBLIC_PREFIXES = [
  "/unlock",
  "/api/unlock",
  "/_next",
  "/icons",
  "/assets",
];
const PUBLIC_FILES = new Set([
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/logo.svg",
  "/robots.txt",
  "/favicon.ico",
]);

/** Length-aware constant-ish comparison to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_FILES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

export function middleware(req: NextRequest) {
  const token = process.env.FARM_ACCESS_TOKEN?.trim();
  if (!token) return NextResponse.next(); // gate disabled — default behaviour

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // 1) Bearer token (programmatic clients / cron).
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    if (safeEqual(auth.slice(7).trim(), token)) return NextResponse.next();
  }

  // 2) Unlock cookie (browsers).
  const cookie = req.cookies.get(ACCESS_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, token)) return NextResponse.next();

  // Locked. APIs get a clean 401; page navigations are sent to /unlock.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked — unlock this device first." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything; the code above short-circuits public paths. Excluding
  // Next's internal static output keeps the middleware off the hot asset path.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
