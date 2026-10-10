/**
 * Farm Command — sync engine.
 *
 * Bridges the local IndexedDB working copy and the Farm Command server:
 *
 *   PUSH: drains the outbox (local changes made offline) to POST /api/sync/push.
 *         Entries are only removed once the server acknowledges them.
 *   PULL: fetches server changes since the last pull cursor from
 *         GET /api/sync/pull and merges them with last-write-wins by
 *         `updatedAt` — newer local edits are never overwritten by older
 *         server data, and server tombstones remove locally deleted records.
 *
 * Conflict strategy (documented in README): deterministic last-write-wins on
 * `updatedAt` timestamps. Because both sides compare timestamps before
 * applying, no change is silently destroyed; the newest edit always survives
 * and older edits are superseded (surfaced in the UI as the record's updated
 * content). Retries are idempotent: pushes carry full record bodies with
 * stable client-generated ids, so re-sending never duplicates records.
 */

import { create } from "zustand";
import { farmDb, getMeta, setMeta, nowIso, type SyncMeta } from "./db";
import { pendingCount } from "./outbox";

export interface SyncStoreState {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  hydrated: boolean; // server data pulled at least once
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setPending: (pending: number) => void;
  setLastSyncedAt: (at: string | null) => void;
  setLastError: (error: string | null) => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useSyncStore = create<SyncStoreState>((set) => ({
  online: true,
  syncing: false,
  pending: 0,
  lastSyncedAt: null,
  lastError: null,
  hydrated: false,
  setOnline: (online) => set({ online }),
  setSyncing: (syncing) => set({ syncing }),
  setPending: (pending) => set({ pending }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setLastError: (lastError) => set({ lastError }),
  setHydrated: (hydrated) => set({ hydrated }),
}));

/** Human-readable sync state for the status chip. */
export function deriveSyncLabel(s: {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastError: string | null;
}): { label: "online" | "offline" | "syncing" | "up_to_date" | "pending" | "issue"; detail: string } {
  if (!s.online) return { label: "offline", detail: "Offline — working locally" };
  if (s.syncing) return { label: "syncing", detail: s.pending > 0 ? `Syncing ${s.pending} change${s.pending === 1 ? "" : "s"}…` : "Syncing…" };
  if (s.lastError) return { label: "issue", detail: "Sync issue — tap to review" };
  if (s.pending > 0) return { label: "pending", detail: `${s.pending} change${s.pending === 1 ? "" : "s"} waiting to sync` };
  return { label: "up_to_date", detail: "Up to date" };
}

// ---------------------------------------------------------------------------
// Syncable tables (name → Dexie table)
// ---------------------------------------------------------------------------

const SYNC_TABLES = [
  "settings", "groups", "animals", "weightRecords", "healthEvents", "vaccinations",
  "fields", "crops", "activities", "tasks", "transactions", "knowledge", "rainfall", "mapItems",
  "poultryFlocks", "eggLogs",
] as const;

type SyncTable = (typeof SYNC_TABLES)[number];

function tableFor(name: string) {
   
  return (farmDb as any).table(name);
}

let syncing = false;

/** Push outbox → server, then pull server changes → local. Safe to call often. */
export async function syncNow(reason: string = "manual"): Promise<{ pushed: number; pulled: number } | { error: string }> {
  if (typeof window === "undefined") return { error: "no-window" };
  if (syncing) return { error: "already-syncing" };
  const store = useSyncStore.getState();
  if (!navigator.onLine) {
    store.setOnline(false);
    return { error: "offline" };
  }

  syncing = true;
  store.setSyncing(true);
  let pushed = 0;
  let pulled = 0;
  try {
    // ---------------- PUSH ----------------
    const entries = await farmDb.outbox.orderBy("seq").toArray();
    if (entries.length > 0) {
      const changes: Array<Record<string, unknown>> = [];
      for (const entry of entries) {
        const record = await tableFor(entry.table).get(entry.recordId);
        if (entry.op === "del") {
          // Include the tombstone record so the server can compare timestamps.
          changes.push({
            table: entry.table,
            recordId: entry.recordId,
            op: "del",
            record: record ?? undefined,
            deletedAt: record?.deletedAt ?? nowIso(),
          });
        } else {
          if (!record) continue; // record vanished locally; drop the queue entry
          changes.push({ table: entry.table, recordId: entry.recordId, op: "put", record });
        }
      }
      if (changes.length > 0) {
        const res = await fetch("/api/sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? `Sync push failed (${res.status})`);
        }
        const data = (await res.json()) as {
          applied: string[]; // `${table}:${recordId}` acks
          conflicts: Array<{ table: string; record: Record<string, unknown> }>; // server-won records
        };
        // Remove acknowledged entries; apply server-won conflict records locally.
        const acked = new Set(data.applied ?? []);
        for (const entry of entries) {
          const key = `${entry.table}:${entry.recordId}`;
          if (acked.has(key)) {
            if (entry.seq != null) await farmDb.outbox.delete(entry.seq);
            pushed++;
          }
        }
        for (const conflict of data.conflicts ?? []) {
          const local = await tableFor(conflict.table).get(conflict.record.id);
          const serverUpdatedAt = String(conflict.record.updatedAt ?? "");
          if (!local || Date.parse(serverUpdatedAt) >= Date.parse(local.updatedAt ?? "")) {
            await tableFor(conflict.table).put(normalizeRecord(conflict.table, conflict.record));
          }
        }
      }
    }

    // ---------------- PULL ----------------
    const since = (await getMeta("lastPullAt")) ?? "";
    const pullRes = await fetch(`/api/sync/pull?since=${encodeURIComponent(since)}`, { cache: "no-store" });
    if (!pullRes.ok) {
      const detail = await pullRes.json().catch(() => null);
      throw new Error(detail?.error ?? `Sync pull failed (${pullRes.status})`);
    }
    const pullData = (await pullRes.json()) as {
      serverTime: string;
      changes: Partial<Record<SyncTable, Record<string, unknown>[]>>;
      tombstones: Partial<Record<SyncTable, { id: string; deletedAt: string }[]>>;
    };

    let touched = false;
    for (const table of SYNC_TABLES) {
      const records = pullData.changes?.[table] ?? [];
      for (const record of records) {
        const id = String(record.id ?? record.key ?? "");
        if (!id) continue;
        const local = (await tableFor(table).get(id)) as (SyncMeta & Record<string, unknown>) | undefined;
        const serverUpdatedAt = String(record.updatedAt ?? "");
        // Never overwrite newer local data with older server data.
        if (local && Date.parse(local.updatedAt ?? "") > Date.parse(serverUpdatedAt)) continue;
        await tableFor(table).put(normalizeRecord(table, record));
        touched = true;
        pulled++;
      }
      const tombs = pullData.tombstones?.[table] ?? [];
      for (const tomb of tombs) {
        const local = (await tableFor(table).get(tomb.id)) as (SyncMeta & Record<string, unknown>) | undefined;
        if (!local) continue;
        // A newer local edit beats the tombstone — it stays queued and will
        // be pushed, resurrecting the record server-side (documented LWW).
        if (Date.parse(local.updatedAt ?? "") > Date.parse(tomb.deletedAt)) continue;
        await tableFor(table).delete(tomb.id);
        touched = true;
      }
    }
    await setMeta("lastPullAt", pullData.serverTime ?? nowIso());

    // Purge local tombstones older than 14 days (server keeps its own).
    await purgeOldTombstones();

    const state = useSyncStore.getState();
    state.setLastError(null);
    state.setLastSyncedAt(nowIso());
    state.setHydrated(true);
    await setMeta("lastSyncedAt", nowIso());
    if (touched || pushed > 0) {
      const { notifyDataChanged } = await import("./outbox");
      notifyDataChanged({ synced: true });
    }

    // Opportunistically ask the server to evaluate push reminders.
    // Fire-and-forget: the server de-duplicates and this must never block sync.
    fetch("/api/push/check", { method: "POST" }).catch(() => {});

    return { pushed, pulled };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    // Failed pushes keep their outbox entries — mark retry counts + error.
    const entries = await farmDb.outbox.toArray();
    for (const entry of entries) {
      if (entry.seq != null) {
        await farmDb.outbox.update(entry.seq, { tries: (entry.tries ?? 0) + 1, lastError: message });
      }
    }
    const state = useSyncStore.getState();
    state.setLastError(message);
    return { error: message };
  } finally {
    syncing = false;
    const state = useSyncStore.getState();
    state.setSyncing(false);
    state.setPending(await pendingCount());
  }
}

/** Coerce a server record into the local row shape (sync metadata present). */
function normalizeRecord(_table: string, record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    createdAt: record.createdAt ?? nowIso(),
    updatedAt: record.updatedAt ?? nowIso(),
    deletedAt: record.deletedAt ?? null,
  };
}

async function purgeOldTombstones(): Promise<void> {
  const cutoff = Date.now() - 14 * 86_400_000;
  for (const table of SYNC_TABLES) {
    if (table === "settings") continue;
     
    const rows = (await tableFor(table).toArray()) as (SyncMeta & { id: string })[];
    for (const row of rows) {
      if (row.deletedAt && Date.parse(row.deletedAt) < cutoff) {
        await tableFor(table).delete(row.id);
      }
    }
  }
}

/** Refresh pending count + connectivity (cheap; called on focus/visibility). */
export async function refreshSyncState(): Promise<void> {
  const state = useSyncStore.getState();
  state.setOnline(navigator.onLine);
  state.setPending(await pendingCount());
  const lastSyncedAt = await getMeta("lastSyncedAt");
  state.setLastSyncedAt(lastSyncedAt);
}

// ---------------------------------------------------------------------------
// Lifecycle wiring (called once from providers)
// ---------------------------------------------------------------------------

let initialized = false;

export function initSyncEngine(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const state = useSyncStore.getState();

  // Initial state
  state.setOnline(navigator.onLine);
  void refreshSyncState();

  // First load: hydrate from the server if we never have.
  void (async () => {
    const lastPullAt = await getMeta("lastPullAt");
    if (!lastPullAt && navigator.onLine) {
      await syncNow("initial-hydration");
    }
  })();

  // Reconnect
  window.addEventListener("online", () => {
    useSyncStore.getState().setOnline(true);
    void syncNow("online-event");
  });
  window.addEventListener("offline", () => {
    useSyncStore.getState().setOnline(false);
  });

  // Periodic sync while the app is visible and online
  window.setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void syncNow("interval");
    }
  }, 30_000);

  // When the tab becomes visible again (user returns to the app)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void refreshSyncState().then(() => syncNow("visibility"));
    }
  });

  // After local writes (debounced)
  let debounceTimer: number | undefined;
  window.addEventListener("farmcmd:data-changed", (event) => {
    const detail = (event as CustomEvent).detail ?? {};
    if (!detail.queued) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      if (navigator.onLine) void syncNow("after-write");
    }, 3_000);
  });
}
