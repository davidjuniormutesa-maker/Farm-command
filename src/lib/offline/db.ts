/**
 * Farm Command — client-side offline database (IndexedDB via Dexie).
 *
 * This is the PRIMARY working copy of the farm data in the browser:
 * every read/write in the UI goes through here first, and a sync engine
 * (./sync.ts) replicates changes to the Farm Command server in the background.
 *
 * - Records are plain JSON DTOs (identical shapes to the server API responses,
 *   with ISO string dates) so the UI code works unchanged.
 * - Every synced record carries sync metadata: `updatedAt`, `createdAt`,
 *   and an optional `deletedAt` tombstone.
 * - localStorage is NOT used for farm data (only the sync engine's small
 *   non-critical UI prefs live in IndexedDB too, in the `meta` table).
 */

import Dexie, { type Table } from "dexie";
import type {
  AnimalDTO,
  CropCycleDTO,
  EggLogDTO,
  FarmActivityDTO,
  FieldDTO,
  FinanceTransactionDTO,
  HealthEventDTO,
  KnowledgeArticleDTO,
  LivestockGroupDTO,
  PoultryFlockDTO,
  RainfallReadingDTO,
  TaskDTO,
  VaccinationDTO,
  WeatherDataDTO,
  WeightRecordDTO,
} from "@/lib/farm";
import type { FarmMapItemDTO } from "./types";

/** A record that participates in synchronization. */
export interface SyncMeta {
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type SettingsRow = { key: string; value: string } & SyncMeta;
export type GroupRow = LivestockGroupDTO & SyncMeta;
export type AnimalRow = AnimalDTO & SyncMeta;
export type WeightRecordRow = WeightRecordDTO & SyncMeta;
export type HealthEventRow = HealthEventDTO & SyncMeta;
export type VaccinationRow = VaccinationDTO & SyncMeta;
export type FieldRow = FieldDTO & SyncMeta;
export type CropRow = CropCycleDTO & SyncMeta;
export type ActivityRow = FarmActivityDTO & SyncMeta;
export type TaskRow = TaskDTO & SyncMeta;
export type TransactionRow = FinanceTransactionDTO & SyncMeta;
export type KnowledgeRow = KnowledgeArticleDTO & SyncMeta;
export type RainfallRow = RainfallReadingDTO & SyncMeta;
export type MapItemRow = FarmMapItemDTO & SyncMeta;
export type PoultryFlockRow = PoultryFlockDTO & SyncMeta;
export type EggLogRow = EggLogDTO & SyncMeta;

/** One queued local change waiting to be pushed to the server. */
export interface OutboxEntry {
  seq?: number; // auto-increment
  table: string;
  recordId: string;
  op: "put" | "del";
  queuedAt: string;
  tries: number;
  lastError?: string | null;
}

/** Small key/value store for sync cursors, device id, UI prefs. */
export interface MetaRow {
  key: string;
  value: string;
}

/** Cache of the last successful weather fetch (online enhancement only). */
export interface WeatherCacheRow {
  id: string; // always "current"
  payload: WeatherDataDTO;
  fetchedAt: string;
}

/** Dedupe log so the same reminder is not re-shown every time the app opens. */
export interface NotifLogRow {
  id: string; // `${kind}:${recordId}:${dueDatePart}`
  shownAt: string;
}

export class FarmCommandDB extends Dexie {
  settings!: Table<SettingsRow, string>;
  groups!: Table<GroupRow, string>;
  animals!: Table<AnimalRow, string>;
  weightRecords!: Table<WeightRecordRow, string>;
  healthEvents!: Table<HealthEventRow, string>;
  vaccinations!: Table<VaccinationRow, string>;
  fields!: Table<FieldRow, string>;
  crops!: Table<CropRow, string>;
  activities!: Table<ActivityRow, string>;
  tasks!: Table<TaskRow, string>;
  transactions!: Table<TransactionRow, string>;
  knowledge!: Table<KnowledgeRow, string>;
  rainfall!: Table<RainfallRow, string>;
  mapItems!: Table<MapItemRow, string>;
  poultryFlocks!: Table<PoultryFlockRow, string>;
  eggLogs!: Table<EggLogRow, string>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaRow, string>;
  weatherCache!: Table<WeatherCacheRow, string>;
  notifLog!: Table<NotifLogRow, string>;

  constructor() {
    super("farm-command");
    this.version(1).stores({
      settings: "key, updatedAt",
      groups: "id, updatedAt, status",
      animals: "id, updatedAt, tagId, groupId, status",
      weightRecords: "id, animalId, updatedAt, recordedAt",
      healthEvents: "id, updatedAt, animalId, groupId, type, date",
      vaccinations: "id, updatedAt, animalId, groupId, dateGiven, nextDueDate",
      fields: "id, updatedAt, name",
      crops: "id, updatedAt, fieldId, status, crop",
      activities: "id, updatedAt, date, type, animalId, groupId, fieldId, cropCycleId",
      tasks: "id, updatedAt, status, dueDate, category, animalId, groupId, cropCycleId, fieldId, vaccinationId",
      transactions: "id, updatedAt, date, type, category, animalId, fieldId, cropCycleId, groupId",
      knowledge: "id, updatedAt, topic",
      rainfall: "id, updatedAt, date",
      mapItems: "id, updatedAt",
      outbox: "++seq, table, recordId",
      meta: "key",
      weatherCache: "id",
      notifLog: "id, shownAt",
    });

    // v2: dedicated Poultry section (flocks + daily egg collection).
    // Dexie carries over v1 stores; we only declare the new tables here.
    this.version(2).stores({
      poultryFlocks: "id, updatedAt, status, birdType",
      eggLogs: "id, updatedAt, flockId, date",
    });
  }
}

export const farmDb = new FarmCommandDB();

// ---------- meta helpers ----------

export async function getMeta(key: string): Promise<string | null> {
  const row = await farmDb.meta.get(key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await farmDb.meta.put({ key, value });
}

export async function delMeta(key: string): Promise<void> {
  await farmDb.meta.delete(key);
}

// ---------- ID generation (client-side, offline-safe) ----------

/**
 * Generate a globally-unique record id on the client so records created
 * offline can sync later without the server having to mint ids.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "fc-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** ISO timestamp for "now" (single source so records are consistent). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Is a record alive (not tombstoned)? */
export function alive<T extends SyncMeta>(row: T): boolean {
  return !row.deletedAt;
}
