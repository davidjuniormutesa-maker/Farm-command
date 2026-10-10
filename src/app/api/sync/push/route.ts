import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { SYNC_SPECS, toDbData } from "../table-specs";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Max changes accepted in a single push (matches the client outbox drain cap). */
const MAX_CHANGES = 5000;
/** Changes applied per DB transaction — keeps each transaction short enough to
 *  avoid interactive-transaction timeouts while staying atomic per chunk. */
const CHUNK_SIZE = 250;

/**
 * A single client change. Records are flat scalar maps (no nested objects /
 * arrays) — the client never sends relation objects, and rejecting them here
 * stops malformed or hostile payloads from reaching the ORM.
 */
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const changeSchema = z.object({
  table: z.string().refine((t) => t in SYNC_SPECS, "Unknown table"),
  recordId: z.string().min(1).max(200),
  op: z.enum(["put", "del"]),
  record: z.record(z.string(), scalar).optional(),
  deletedAt: z.string().optional(),
});
const bodySchema = z.object({
  changes: z.array(changeSchema).max(MAX_CHANGES),
});

type Change = z.infer<typeof changeSchema>;

function serializeExisting(existing: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(existing, (_k, v) => (v instanceof Date ? v.toISOString() : v)));
}

/**
 * POST /api/sync/push — apply a batch of client changes idempotently.
 *
 * Conflict strategy: last-write-wins on `updatedAt`.
 * - "put": applied when the incoming record is >= the stored record's
 *   updatedAt (or the record does not exist yet). Otherwise the server copy
 *   is newer and is returned in `conflicts` so the client can catch up.
 * - "del": tombstones the record unless the stored record is newer than the
 *   delete (another device edited after this delete was queued) — then the
 *   stored record is returned as a conflict instead.
 *
 * Retries are safe: pushing the same change twice is a no-op. Each chunk is
 * wrapped in a database transaction so a mid-batch failure never leaves the
 * server with a half-applied chunk.
 */
export async function POST(req: Request) {
  try {
    // ---- Rate limit: protect the sync endpoint from runaway/abusive clients. ----
    const rl = rateLimit("sync-push", clientIp(req), 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many sync requests — retrying shortly." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }

    // ---- Validate the envelope. ----
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Expected { changes: [...] }" },
        { status: 400 }
      );
    }

    const applied: string[] = [];
    const conflicts: Array<{ table: string; record: Record<string, unknown> }> = [];

    // Process in atomic chunks.
    const changes = parsed.data.changes;
    for (let start = 0; start < changes.length; start += CHUNK_SIZE) {
      const chunk = changes.slice(start, start + CHUNK_SIZE);
      await db.$transaction(
        async (tx) => {
          for (const change of chunk) {
            await applyChange(tx, change, applied, conflicts);
          }
        },
        { timeout: 30_000, maxWait: 10_000 }
      );
    }

    return NextResponse.json({ applied, conflicts });
  } catch (error) {
    console.error("POST /api/sync/push failed", error);
    return NextResponse.json({ error: "Sync push failed on the server" }, { status: 500 });
  }
}

async function applyChange(
   
  tx: any,
  change: Change,
  applied: string[],
  conflicts: Array<{ table: string; record: Record<string, unknown> }>
): Promise<void> {
  const spec = SYNC_SPECS[change.table];
  if (!spec) return;
  const model = tx[spec.name];
  const ack = `${change.table}:${change.recordId}`;

  if (change.op === "del") {
    const existing = await model.findUnique({ where: { [spec.idField]: change.recordId } });
    if (!existing) {
      applied.push(ack); // already gone — idempotent ack
      return;
    }
    const recordDeletedAt = typeof change.record?.deletedAt === "string" ? change.record.deletedAt : "";
    const deleteAt = String(change.deletedAt || recordDeletedAt || new Date().toISOString());
    const deleteTime = Date.parse(deleteAt);
    if (existing.updatedAt && existing.updatedAt.getTime() > deleteTime) {
      // The stored record is newer than this delete — server wins.
      conflicts.push({ table: change.table, record: serializeExisting(existing) });
      return;
    }
    await model.update({
      where: { [spec.idField]: change.recordId },
      data: { deletedAt: new Date(deleteTime), updatedAt: new Date(deleteTime) },
    });
    applied.push(ack);
    return;
  }

  // op === "put"
  const record = change.record;
  if (!record || typeof record !== "object") return;
  const idValue = (record[spec.idField] as string | undefined) ?? change.recordId;

  const existing = await model.findUnique({ where: { [spec.idField]: idValue } });
  const incomingUpdatedAt = Date.parse(String(record.updatedAt ?? ""));

  if (existing && existing.updatedAt && existing.updatedAt.getTime() > incomingUpdatedAt) {
    // Stored record is newer — keep it, hand it back to the client.
    conflicts.push({ table: change.table, record: serializeExisting(existing) });
    applied.push(ack);
    return;
  }

  let data: Record<string, unknown>;
  try {
    data = toDbData(spec, record);
  } catch {
    return; // skip malformed records rather than failing the whole chunk
  }

  if (!existing) {
     
    await model.create({ data: { ...data, [spec.idField]: idValue } as any });
  } else {
     
    await model.update({ where: { [spec.idField]: idValue }, data: data as any });
  }
  applied.push(ack);
}
