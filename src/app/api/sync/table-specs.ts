/**
 * Farm Command — server sync: table specifications.
 *
 * Maps the client-side sync table names to Prisma models and declares which
 * fields are dates (client records arrive with ISO strings; the database wants
 * Date objects). Also provides the generic serializer back to client JSON.
 */

import { db } from "@/lib/db";

 
type AnyModel = any;

export interface TableSpec {
  /** Prisma delegate, e.g. db.animal */
  model: AnyModel;
  /** Prisma delegate property name, e.g. "animal" — used to resolve the same
   *  delegate on a transaction client (`tx[name]`). */
  name: string;
  /** Date fields converted from ISO strings on write, and to ISO strings on read. */
  dates: string[];
  /** Id field ("id" or "key" for FarmSetting). */
  idField: "id" | "key";
}

export const SYNC_SPECS: Record<string, TableSpec> = {
  settings: { model: db.farmSetting, name: "farmSetting", dates: [], idField: "key" },
  groups: { model: db.livestockGroup, name: "livestockGroup", dates: [], idField: "id" },
  animals: { model: db.animal, name: "animal", dates: ["birthDate", "acquisitionDate"], idField: "id" },
  weightRecords: { model: db.weightRecord, name: "weightRecord", dates: ["recordedAt"], idField: "id" },
  healthEvents: { model: db.healthEvent, name: "healthEvent", dates: ["date"], idField: "id" },
  vaccinations: { model: db.vaccination, name: "vaccination", dates: ["dateGiven", "nextDueDate"], idField: "id" },
  fields: { model: db.field, name: "field", dates: [], idField: "id" },
  crops: { model: db.cropCycle, name: "cropCycle", dates: ["plantingDate", "expectedHarvestDate", "actualHarvestDate"], idField: "id" },
  activities: { model: db.farmActivity, name: "farmActivity", dates: ["date"], idField: "id" },
  tasks: { model: db.task, name: "task", dates: ["dueDate", "completedAt"], idField: "id" },
  transactions: { model: db.financeTransaction, name: "financeTransaction", dates: ["date"], idField: "id" },
  knowledge: { model: db.knowledgeArticle, name: "knowledgeArticle", dates: ["retrievedDate"], idField: "id" },
  rainfall: { model: db.rainfallLog, name: "rainfallLog", dates: ["date"], idField: "id" },
  mapItems: { model: db.farmMapItem, name: "farmMapItem", dates: [], idField: "id" },
  poultryFlocks: { model: db.poultryFlock, name: "poultryFlock", dates: [], idField: "id" },
  eggLogs: { model: db.eggLog, name: "eggLog", dates: ["date"], idField: "id" },
};

const ALWAYS_DATES = ["createdAt", "updatedAt", "deletedAt"];

/** Client record (ISO strings) → Prisma create/update data (Date objects). */
export function toDbData(spec: TableSpec, record: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (spec.dates.includes(key) || ALWAYS_DATES.includes(key)) {
      if (value === null || value === undefined || value === "") {
        data[key] = key === "deletedAt" ? null : undefined;
        if (key !== "deletedAt" && data[key] === undefined) delete data[key];
      } else {
        const d = new Date(value as string);
        if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for ${key}`);
        data[key] = d;
      }
    } else {
      data[key] = value;
    }
  }
  // Never let clients forge server-managed relation objects
  for (const rel of ["animal", "group", "field", "cropCycle", "flock", "eggLogs"]) delete data[rel];
  return data;
}

/** Prisma row → client JSON (ISO date strings, nulls preserved). */
export function serializeRow(spec: TableSpec, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) out[key] = value.toISOString();
    else out[key] = value;
  }
  return out;
}

/** Rows changed after `since` (updates + tombstones), capped for sane payloads. */
export async function pullTable(
  spec: TableSpec,
  since: Date,
  take = 1000
): Promise<{ records: Record<string, unknown>[]; tombstones: { id: string; deletedAt: string }[] }> {
  const idField = spec.idField;
   
  const rows: Record<string, unknown>[] = await spec.model.findMany({
    where: {
      OR: [
        { updatedAt: { gt: since } },
        { deletedAt: { gt: since } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take,
  });
  const records: Record<string, unknown>[] = [];
  const tombstones: { id: string; deletedAt: string }[] = [];
  for (const row of rows) {
    const deletedAt = row.deletedAt as Date | null;
    if (deletedAt) {
      tombstones.push({ id: String(row[idField]), deletedAt: deletedAt.toISOString() });
    } else {
      records.push(serializeRow(spec, row));
    }
  }
  return { records, tombstones };
}
