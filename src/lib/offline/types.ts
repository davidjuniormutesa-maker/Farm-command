/**
 * Farm Command — shared offline-layer types (sync engine, local DB, map DTO).
 */

/** Farm map layout item (mirrors the server FarmMapItem model as a DTO). */
export interface FarmMapItemDTO {
  id: string;
  kind: string; // field | paddock | building | water | gate | road | other
  label: string;
  x: number; // % of canvas width (left edge)
  y: number; // % of canvas height (top edge)
  w: number; // % of canvas width
  h: number; // % of canvas height
  color?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Sync/connection state surfaced in the UI. */
export type SyncStateLabel =
  | "online" // Online
  | "offline" // Offline — working locally
  | "syncing" // Syncing N changes…
  | "up_to_date" // Up to date
  | "pending" // N changes waiting to sync
  | "issue"; // Sync issue — tap to review

/** Full JSON backup document (versioned format). */
export interface BackupDocument {
  app: "farm-command";
  version: 2;
  exportedAt: string;
  settings: Record<string, string>;
  data: {
    groups: unknown[];
    animals: unknown[];
    weightRecords: unknown[];
    healthEvents: unknown[];
    vaccinations: unknown[];
    fields: unknown[];
    crops: unknown[];
    activities: unknown[];
    tasks: unknown[];
    transactions: unknown[];
    knowledge: unknown[];
    rainfall: unknown[];
    mapItems: unknown[];
  };
}

/** Result summary after importing a backup document. */
export interface BackupCounts {
  groups: number;
  animals: number;
  weightRecords: number;
  healthEvents: number;
  vaccinations: number;
  fields: number;
  crops: number;
  activities: number;
  tasks: number;
  transactions: number;
  knowledge: number;
  rainfall: number;
  mapItems: number;
}
