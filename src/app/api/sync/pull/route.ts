import { NextResponse } from "next/server";
import { SYNC_SPECS, pullTable } from "../table-specs";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync/pull?since=<ISO> — all server changes since the cursor.
 *
 * Returns records updated after `since` (created, edited or resurrected) plus
 * tombstones (deletedAt set) so the client can apply deletes. `serverTime`
 * becomes the client's next cursor. With no `since`, everything is returned
 * (full hydration for a new device).
 */
export async function GET(req: Request) {
  try {
    const rl = rateLimit("sync-pull", clientIp(req), 120, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many sync requests — retrying shortly." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }
    const { searchParams } = new URL(req.url);
    const sinceRaw = searchParams.get("since") ?? "";
    const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : new Date(0);

    const changes: Record<string, Record<string, unknown>[]> = {};
    const tombstones: Record<string, { id: string; deletedAt: string }[]> = {};

    for (const [table, spec] of Object.entries(SYNC_SPECS)) {
      const result = await pullTable(spec, since);
      if (result.records.length > 0) changes[table] = result.records;
      if (result.tombstones.length > 0) tombstones[table] = result.tombstones;
    }

    return NextResponse.json({ serverTime: new Date().toISOString(), changes, tombstones });
  } catch (error) {
    console.error("GET /api/sync/pull failed", error);
    return NextResponse.json({ error: "Sync pull failed on the server" }, { status: 500 });
  }
}
