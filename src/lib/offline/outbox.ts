/**
 * Farm Command — outbox (sync queue).
 *
 * Every local write enqueues a change here. The sync engine drains the outbox
 * to the server when connectivity returns. Entries are NEVER dropped on
 * failure — they stay queued (with a retry counter and last error) until the
 * server acknowledges them.
 */

import { farmDb, type OutboxEntry } from "./db";

/** Enqueue a change (deduped per table+record: the newest op wins). */
export async function queueChange(table: string, recordId: string, op: "put" | "del"): Promise<void> {
  const existing = await farmDb.outbox.where("table").equals(table).toArray();
  const prev = existing.find((e) => e.recordId === recordId);
  if (prev?.seq != null) {
    await farmDb.outbox.update(prev.seq, { op, queuedAt: new Date().toISOString() });
  } else {
    const entry: OutboxEntry = {
      table,
      recordId,
      op,
      queuedAt: new Date().toISOString(),
      tries: 0,
      lastError: null,
    };
    await farmDb.outbox.add(entry);
  }
  notifyDataChanged({ queued: true });
}

/** Simple global notification so React can invalidate queries after local writes. */
const DATA_CHANGED_EVENT = "farmcmd:data-changed";

export interface DataChangedDetail {
  queued?: boolean;
  synced?: boolean;
}

export function notifyDataChanged(detail: DataChangedDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail }));
}

export function onDataChanged(handler: (detail: DataChangedDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent).detail ?? {});
  window.addEventListener(DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, listener);
}

/** Current number of queued changes. */
export async function pendingCount(): Promise<number> {
  return farmDb.outbox.count();
}
