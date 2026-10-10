/**
 * Farm Command — OFFLINE-FIRST API facade.
 *
 * Every UI read/write goes through `apiGet` / `apiSend` (same signatures the
 * app has always used). Instead of hitting the network, calls are served from
 * the local IndexedDB working copy (Dexie) and written locally FIRST:
 *
 *   user action → local DB → UI updates → outbox queue → sync engine → server
 *
 * Only true online enhancements (weather, AI, web-push management) still
 * require the network; weather falls back to a cached snapshot with a stale
 * flag, and everything else works with zero connectivity.
 *
 * Deletes are tombstoned (`deletedAt`) and every record carries
 * createdAt/updatedAt, which the sync engine uses for safe last-write-wins
 * replication — never silently losing newer local data.
 */

import { addDays, addMonths } from "date-fns";
import {
  farmDb,
  newId,
  nowIso,
  alive,
  getMeta,
  type AnimalRow,
  type ActivityRow,
  type CropRow,
  type EggLogRow,
  type FieldRow,
  type GroupRow,
  type HealthEventRow,
  type KnowledgeRow,
  type MapItemRow,
  type PoultryFlockRow,
  type RainfallRow,
  type SettingsRow,
  type SyncMeta,
  type TaskRow,
  type TransactionRow,
  type VaccinationRow,
  type WeightRecordRow,
} from "./db";
import { buildSeedDataset } from "./seed-data";
import { CURATED_TITLES } from "@/app/api/knowledge/seed-articles";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/settings-schema";
import { daysUntil, startOfToday, formatKwacha, computeTaskStatus, type SummaryCounts } from "@/lib/farm";
import type { EggLogDTO, PoultryFlockWithEggsDTO } from "@/lib/farm";
import type {
  AnimalDTO,
  BackupCountsResponse,
  DashboardData,
  FinanceSummaryDTO,
  KnowledgeArticleItemDTO,
  MapItemDTOResponse,
  RainfallResponseDTO,
  ReportsPayloadDTO,
  TaskWithLinksDTO,
  VaccinationWithRefsDTO,
  HealthEventWithRefsDTO,
  AnimalWithGroupDTO,
  FinanceRowDTO,
  CropCycleWithFieldDTO,
  FieldWithCyclesDTO,
  FarmActivityWithNamesDTO,
  WeatherDataDTO,
  FarmSettingsData,
} from "./dto";
import { queueChange, notifyDataChanged } from "./outbox";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Write a record locally (put) and queue it for the next sync. */
async function putLocal<T extends { id: string } & SyncMeta>(table: string, record: T): Promise<T> {
   
  await (farmDb as any).table(table).put(record);
  await queueChange(table, record.id, "put");
  return record;
}

/** Tombstone a record locally and queue the delete for sync. */
async function deleteLocal(table: string, id: string): Promise<void> {
   
  const t = (farmDb as any).table(table);
  const row = await t.get(id);
  if (!row) return;
  await t.put({ ...row, deletedAt: nowIso(), updatedAt: nowIso() });
  await queueChange(table, id, "del");
}

function allRows<T>(rows: T[]): T[] {
  return rows.filter((r) => alive(r as unknown as SyncMeta));
}

// ---------------------------------------------------------------------------
// Local cascade behaviour (mirrors the server's Prisma onDelete rules)
// ---------------------------------------------------------------------------

async function cascadeDeleteAnimal(animalId: string): Promise<void> {
  const now = nowIso();
  // Cascade: weight records, health events and vaccinations die with the animal
  const [weights, events, vaccs] = await Promise.all([
    farmDb.weightRecords.where("animalId").equals(animalId).toArray(),
    farmDb.healthEvents.where("animalId").equals(animalId).toArray(),
    farmDb.vaccinations.where("animalId").equals(animalId).toArray(),
  ]);
  for (const r of weights) if (!r.deletedAt) await deleteLocal("weightRecords", r.id);
  for (const r of events) if (!r.deletedAt) await deleteLocal("healthEvents", r.id);
  for (const r of vaccs) {
    if (r.deletedAt) continue;
    // also drop the vaccination's open reminder task
    const openTasks = allRows(await farmDb.tasks.toArray());
    for (const t of openTasks) {
      if (t.vaccinationId === r.id && t.status === "open") await deleteLocal("tasks", t.id);
    }
    await deleteLocal("vaccinations", r.id);
  }
  // SetNull relations
  for (const coll of ["tasks", "activities", "transactions"] as const) {
     
    const rows = (await (farmDb as any).table(coll).toArray()) as { animalId?: string | null; deletedAt?: string | null }[];
    for (const r of rows) {
      if (r.animalId === animalId && !r.deletedAt) {
         
        await putLocal(coll, { ...(r as any), animalId: null, updatedAt: now });
      }
    }
  }
}

async function cascadeDeleteGroup(groupId: string): Promise<void> {
  const now = nowIso();
  const [events, vaccs] = await Promise.all([
    farmDb.healthEvents.where("groupId").equals(groupId).toArray(),
    farmDb.vaccinations.where("groupId").equals(groupId).toArray(),
  ]);
  for (const r of events) if (!r.deletedAt) await deleteLocal("healthEvents", r.id);
  for (const r of vaccs) if (!r.deletedAt) await deleteLocal("vaccinations", r.id);
  const animals = await farmDb.animals.where("groupId").equals(groupId).toArray();
  for (const a of animals) {
    if (!a.deletedAt) await putLocal("animals", { ...a, groupId: null, updatedAt: now });
  }
  for (const coll of ["tasks", "activities", "transactions"] as const) {
     
    const rows = (await (farmDb as any).table(coll).toArray()) as (GroupRow & { groupId?: string | null })[];
    for (const r of rows) {
      if (r.groupId === groupId && !r.deletedAt) {
        await putLocal(coll, { ...r, groupId: null, updatedAt: now });
      }
    }
  }
}

async function cascadeNullField(fieldName: "fieldId" | "cropCycleId", fieldId: string): Promise<void> {
  const now = nowIso();
  for (const coll of ["crops", "tasks", "activities", "transactions"] as const) {
     
    const rows = (await (farmDb as any).table(coll).toArray()) as Record<string, unknown>[];
    for (const r of rows) {
      if (r[fieldName] === fieldId && !r.deletedAt) {
        await putLocal(coll, { ...r, [fieldName]: null, updatedAt: now } as never);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lookups (joins) built from the local tables
// ---------------------------------------------------------------------------

interface LookupMaps {
  animals: Map<string, AnimalRow>;
  groups: Map<string, GroupRow>;
  fields: Map<string, FieldRow>;
  crops: Map<string, CropRow>;
}

async function buildLookups(): Promise<LookupMaps> {
  const [animals, groups, fields, crops] = await Promise.all([
    farmDb.animals.toArray(),
    farmDb.groups.toArray(),
    farmDb.fields.toArray(),
    farmDb.crops.toArray(),
  ]);
  return {
    animals: new Map(animals.map((a) => [a.id, a])),
    groups: new Map(groups.map((g) => [g.id, g])),
    fields: new Map(fields.map((f) => [f.id, f])),
    crops: new Map(crops.map((c) => [c.id, c])),
  };
}

function animalRef(a?: AnimalRow): { id: string; tagId: string; name: string | null } | null {
  return a ? { id: a.id, tagId: a.tagId, name: a.name ?? null } : null;
}
function groupRef(g?: GroupRow): { id: string; name: string } | null {
  return g ? { id: g.id, name: g.name } : null;
}
function fieldRef(f?: FieldRow): { id: string; name: string } | null {
  return f ? { id: f.id, name: f.name } : null;
}
function cropRef(c?: CropRow): { id: string; crop: string; variety: string | null } | null {
  return c ? { id: c.id, crop: c.crop, variety: c.variety ?? null } : null;
}

// ---------------------------------------------------------------------------
// GET routing
// ---------------------------------------------------------------------------

async function getSettings(): Promise<FarmSettingsData> {
  const rows = await farmDb.settings.toArray();
  const map: Record<string, string> = {};
  for (const r of allRows(rows)) map[r.key] = r.value;
  return parseSettings(map);
}

async function getAnimals(): Promise<AnimalWithGroupDTO[]> {
  const rows = allRows(await farmDb.animals.toArray()).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
  const groups = new Map((await farmDb.groups.toArray()).map((g) => [g.id, g]));
  return rows.map((a) => ({ ...a, group: a.groupId ? groupRef(groups.get(a.groupId)) : null }));
}

async function getAnimal(id: string): Promise<AnimalWithGroupDTO | null> {
  const a = await farmDb.animals.get(id);
  if (!a || !alive(a)) return null;
  const g = a.groupId ? await farmDb.groups.get(a.groupId) : null;
  return { ...a, group: groupRef(g ?? undefined) };
}

async function getWeights(animalId: string) {
  const animal = await farmDb.animals.get(animalId);
  const rows = (await farmDb.weightRecords.where("animalId").equals(animalId).toArray())
    .filter(alive)
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  return {
    animal: animal
      ? { id: animal.id, tagId: animal.tagId, name: animal.name ?? null, weightKg: animal.weightKg ?? null }
      : { id: animalId, tagId: "", name: null, weightKg: null },
    records: rows.map((r) => ({ id: r.id, animalId: r.animalId, weightKg: r.weightKg, recordedAt: r.recordedAt, note: r.note ?? null })),
  };
}

async function getHealthEvents(params: URLSearchParams): Promise<HealthEventWithRefsDTO[]> {
  const animalId = params.get("animalId");
  const groupId = params.get("groupId");
  let rows = allRows(await farmDb.healthEvents.toArray());
  if (animalId) rows = rows.filter((r) => r.animalId === animalId);
  if (groupId) rows = rows.filter((r) => r.groupId === groupId);
  const { animals, groups } = await buildLookups();
  return rows
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((r) => ({
      ...r,
      animal: r.animalId ? animalRef(animals.get(r.animalId)) : null,
      group: r.groupId ? groupRef(groups.get(r.groupId)) : null,
    }));
}

async function getVaccinations(params: URLSearchParams): Promise<VaccinationWithRefsDTO[]> {
  const animalId = params.get("animalId");
  const groupId = params.get("groupId");
  let rows = allRows(await farmDb.vaccinations.toArray());
  if (animalId) rows = rows.filter((r) => r.animalId === animalId);
  if (groupId) rows = rows.filter((r) => r.groupId === groupId);
  const { animals, groups } = await buildLookups();
  return rows
    .sort((a, b) => Date.parse(b.dateGiven) - Date.parse(a.dateGiven))
    .map((r) => ({
      ...r,
      animal: r.animalId ? animalRef(animals.get(r.animalId)) : null,
      group: r.groupId ? groupRef(groups.get(r.groupId)) : null,
    }));
}

async function getTasks(): Promise<TaskWithLinksDTO[]> {
  const rows = allRows(await farmDb.tasks.toArray());
  const { animals, groups, fields, crops } = await buildLookups();
  return rows
    .sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate))
    .map((t) => ({
      ...t,
      animal: t.animalId ? animalRef(animals.get(t.animalId)) : null,
      group: t.groupId ? groupRef(groups.get(t.groupId)) : null,
      cropCycle: t.cropCycleId ? cropRef(crops.get(t.cropCycleId)) : null,
      field: t.fieldId ? fieldRef(fields.get(t.fieldId)) : null,
    }));
}

async function getFieldsWithCycles(): Promise<FieldWithCyclesDTO[]> {
  const [fields, crops] = await Promise.all([farmDb.fields.toArray(), farmDb.crops.toArray()]);
  const active = allRows(crops).filter((c) => c.status === "planned" || c.status === "growing");
  return allRows(fields)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((f) => ({
      ...f,
      cropCycles: active
        .filter((c) => c.fieldId === f.id)
        .sort((a, b) => Date.parse(b.plantingDate ?? "") - Date.parse(a.plantingDate ?? ""))
        .map((c) => ({
          id: c.id, crop: c.crop, variety: c.variety ?? null, status: c.status,
          plantingDate: c.plantingDate ?? null, expectedHarvestDate: c.expectedHarvestDate ?? null,
        })),
    }));
}

async function getCropsWithField(): Promise<CropCycleWithFieldDTO[]> {
  const rows = allRows(await farmDb.crops.toArray());
  const { fields } = await buildLookups();
  return rows
    .sort((a, b) => Date.parse(b.plantingDate ?? b.createdAt) - Date.parse(a.plantingDate ?? a.createdAt))
    .map((c) => ({ ...c, field: c.fieldId ? fieldRef(fields.get(c.fieldId)) : null }));
}

async function getActivities(params: URLSearchParams): Promise<FarmActivityWithNamesDTO[]> {
  let rows = allRows(await farmDb.activities.toArray());
  for (const key of ["cropCycleId", "fieldId", "animalId", "groupId"] as const) {
    const v = params.get(key);
    if (v) rows = rows.filter((r) => r[key] === v);
  }
  const type = params.get("type");
  if (type) rows = rows.filter((r) => r.type === type);
  const { animals, groups, fields, crops } = await buildLookups();
  return rows
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((r) => ({
      ...r,
      animal: r.animalId ? animalRef(animals.get(r.animalId)) : null,
      group: r.groupId ? groupRef(groups.get(r.groupId)) : null,
      field: r.fieldId ? fieldRef(fields.get(r.fieldId)) : null,
      cropCycle: r.cropCycleId ? cropRef(crops.get(r.cropCycleId)) : null,
    }));
}

async function getFinanceRows(params: URLSearchParams): Promise<FinanceRowDTO[]> {
  const type = params.get("type");
  const category = params.get("category");
  const from = params.get("from");
  const to = params.get("to");
  let rows = allRows(await farmDb.transactions.toArray());
  if (type) rows = rows.filter((r) => r.type === type);
  if (category) rows = rows.filter((r) => r.category === category);
  if (from) {
    const f = Date.parse(from);
    if (!Number.isNaN(f)) rows = rows.filter((r) => Date.parse(r.date) >= f);
  }
  if (to) {
    const t = Date.parse(to);
    if (!Number.isNaN(t)) rows = rows.filter((r) => Date.parse(r.date) <= t);
  }
  const { animals, groups, fields, crops } = await buildLookups();
  return rows
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((r) => ({
      ...r,
      animal: r.animalId ? animalRef(animals.get(r.animalId)) : null,
      group: r.groupId ? groupRef(groups.get(r.groupId)) : null,
      field: r.fieldId ? fieldRef(fields.get(r.fieldId)) : null,
      cropCycle: r.cropCycleId ? cropRef(crops.get(r.cropCycleId)) : null,
    }));
}

async function getFinanceSummary(params: URLSearchParams): Promise<FinanceSummaryDTO> {
  const rows = await getFinanceRows(params);
  let income = 0, expense = 0;
  const incomeBy = new Map<string, number>();
  const expenseBy = new Map<string, number>();
  for (const r of rows) {
    if (r.type === "income") {
      income += r.amount;
      incomeBy.set(r.category, (incomeBy.get(r.category) ?? 0) + r.amount);
    } else {
      expense += r.amount;
      expenseBy.set(r.category, (expenseBy.get(r.category) ?? 0) + r.amount);
    }
  }
  const sortCat = (m: Map<string, number>) =>
    [...m.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  return {
    from: params.get("from"),
    to: params.get("to"),
    income,
    expense,
    net: income - expense,
    count: rows.length,
    incomeByCategory: sortCat(incomeBy),
    expenseByCategory: sortCat(expenseBy),
  };
}

async function getKnowledge(): Promise<KnowledgeArticleItemDTO[]> {
  const rows = allRows(await farmDb.knowledge.toArray())
    .sort((a, b) => Date.parse(b.retrievedDate) - Date.parse(a.retrievedDate) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((r) => ({ ...r, userAdded: !CURATED_TITLES.has(r.title) }));
  return rows;
}

async function getRainfall(): Promise<RainfallResponseDTO> {
  const rows = allRows(await farmDb.rainfall.toArray());
  const byDate = new Map<string, RainfallRow>();
  for (const r of rows) {
    const key = new Date(r.date).toDateString();
    const existing = byDate.get(key);
    if (!existing || Date.parse(r.updatedAt) > Date.parse(existing.updatedAt)) byDate.set(key, r);
  }
  const readings = [...byDate.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const today = startOfToday();
  const sum = (days: number) =>
    [...byDate.values()]
      .filter((r) => {
        const d = new Date(r.date);
        const start = new Date(today);
        start.setDate(start.getDate() - (days - 1));
        return d >= start && d <= new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      })
      .reduce((s, r) => s + r.mm, 0);
  const todayReading = readings.find((r) => sameDay(new Date(r.date), today));
  const last12MonthsStart = new Date(today);
  last12MonthsStart.setMonth(last12MonthsStart.getMonth() - 12);
  const last12 = [...byDate.values()].filter((r) => new Date(r.date) >= last12MonthsStart).reduce((s, r) => s + r.mm, 0);
  const lastRain = readings.find((r) => r.mm > 0) ?? null;
  return {
    readings: readings.map((r) => ({ id: r.id, date: r.date, mm: r.mm, note: r.note ?? null })),
    today: todayReading ? todayReading.mm : null,
    last7: sum(7),
    last30: sum(30),
    last12Months: last12,
    lastRain: lastRain ? { date: lastRain.date, mm: lastRain.mm } : null,
  };
}

async function getMapItems(): Promise<MapItemDTOResponse[]> {
  return allRows(await farmDb.mapItems.toArray());
}

/** Local group list — mirrors the server route (name asc, ?status= filter, tombstones removed). */
async function getGroups(params?: URLSearchParams): Promise<GroupRow[]> {
  const status = params?.get("status") ?? undefined;
  const rows = allRows(await farmDb.groups.toArray());
  return rows
    .filter((g) => (status ? g.status === status : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Poultry (dedicated section — flocks + daily egg collection, offline-first)
// ---------------------------------------------------------------------------

async function getFlocks(params?: URLSearchParams): Promise<PoultryFlockRow[]> {
  const status = params?.get("status") ?? undefined;
  const birdType = params?.get("birdType") ?? undefined;
  const rows = allRows(await farmDb.poultryFlocks.toArray());
  return rows
    .filter((f) => (status ? f.status === status : true))
    .filter((f) => (birdType ? f.birdType === birdType : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getFlockEggRows(flockId: string): Promise<EggLogRow[]> {
  const rows = allRows(await farmDb.eggLogs.toArray()).filter((r) => r.flockId === flockId);
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

async function getFlock(id: string): Promise<PoultryFlockWithEggsDTO | null> {
  const flock = await farmDb.poultryFlocks.get(id);
  if (!flock || flock.deletedAt) return null;
  const eggRows = await getFlockEggRows(id);
  const today = startOfToday();
  const weekAgo = addDays(today, -6); // today + previous 6 days = last 7 days
  let eggsToday = 0;
  let eggsLast7Days = 0;
  let eggsTotal = 0;
  for (const r of eggRows) {
    const d = new Date(r.date);
    eggsTotal += r.eggs;
    if (sameDay(d, today)) eggsToday += r.eggs;
    if (d >= weekAgo) eggsLast7Days += r.eggs;
  }
  return {
    ...(flock as PoultryFlockWithEggsDTO),
    eggLogs: eggRows as EggLogDTO[],
    eggsToday,
    eggsLast7Days,
    eggsTotal,
  };
}

async function getEggs(flockId: string): Promise<EggLogRow[]> {
  return getFlockEggRows(flockId);
}

async function createEggLog(
  flockId: string,
  body: { date?: string; eggs: number; notes?: string | null }
): Promise<EggLogRow> {
  const flock = await farmDb.poultryFlocks.get(flockId);
  if (!flock || flock.deletedAt) throw new OfflineError("Flock not found", 404);
  const now = nowIso();
  const record: EggLogRow = {
    id: newId(),
    flockId,
    date: body.date ? new Date(body.date).toISOString() : now,
    eggs: typeof body.eggs === "number" && body.eggs >= 0 ? Math.round(body.eggs) : 0,
    notes: body.notes ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await putLocal("eggLogs", record);
  return record;
}

async function cascadeDeleteFlock(flockId: string): Promise<void> {
  const eggs = allRows(await farmDb.eggLogs.toArray()).filter((r) => r.flockId === flockId);
  for (const r of eggs) if (!r.deletedAt) await deleteLocal("eggLogs", r.id);
}

// ---------------------------------------------------------------------------
// Dashboard / reports (computed locally — work fully offline)
// ---------------------------------------------------------------------------

async function getDashboard(): Promise<DashboardData> {
  const today = startOfToday();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [tasks, vaccinations, crops, animals, groups, fields, activities, transactions] = await Promise.all([
    farmDb.tasks.toArray(),
    farmDb.vaccinations.toArray(),
    farmDb.crops.toArray(),
    farmDb.animals.toArray(),
    farmDb.groups.toArray(),
    farmDb.fields.toArray(),
    farmDb.activities.toArray(),
    farmDb.transactions.toArray(),
  ]);

  const openTasks = allRows(tasks)
    .filter((t) => t.status === "open")
    .sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate));
  const overdue: TaskRow[] = [];
  const dueToday: TaskRow[] = [];
  const upcoming: TaskRow[] = [];
  for (const t of openTasks) {
    const s = computeTaskStatus(t);
    if (s === "overdue") overdue.push(t);
    else if (s === "due_today") dueToday.push(t);
    else upcoming.push(t);
  }
  const { animals: animalMap, groups: groupMap, fields: fieldMap, crops: cropMap } = await buildLookups();
  const withLinks = (t: TaskRow): TaskWithLinksDTO => ({
    ...t,
    animal: t.animalId ? animalRef(animalMap.get(t.animalId)) : null,
    group: t.groupId ? groupRef(groupMap.get(t.groupId)) : null,
    cropCycle: t.cropCycleId ? cropRef(cropMap.get(t.cropCycleId)) : null,
    field: t.fieldId ? fieldRef(fieldMap.get(t.fieldId)) : null,
  });

  const vacTargets = allRows(vaccinations)
    .filter((v) => v.nextDueDate)
    .map((v) => {
      const a = v.animalId ? animalMap.get(v.animalId) : undefined;
      const g = v.groupId ? groupMap.get(v.groupId) : undefined;
      return {
        id: v.id,
        vaccineName: v.vaccineName,
        target: a ? (a.name ? `${a.tagId} — ${a.name}` : a.tagId) : (g?.name ?? "Group"),
        nextDueDate: v.nextDueDate!,
        days: daysUntil(v.nextDueDate!) ?? 0,
      };
    })
    .sort((a, b) => a.days - b.days);
  const overdueVaccinations = vacTargets.filter((v) => v.days < 0);
  const soonVaccinations = vacTargets.filter((v) => v.days >= 0 && v.days <= 30);

  const activeCrops = allRows(crops)
    .filter((c) => c.status === "planned" || c.status === "growing")
    .sort((a, b) => Date.parse(b.plantingDate ?? b.createdAt) - Date.parse(a.plantingDate ?? a.createdAt));
  const nearingHarvest = activeCrops
    .filter((c) => c.expectedHarvestDate)
    .map((c) => ({
      id: c.id,
      crop: c.crop,
      field: c.fieldId ? fieldMap.get(c.fieldId)?.name ?? null : null,
      expectedHarvestDate: c.expectedHarvestDate!,
      days: daysUntil(c.expectedHarvestDate!) ?? 0,
    }))
    .filter((c) => c.days <= 14)
    .sort((a, b) => a.days - b.days);

  const monthTx = allRows(transactions).filter((r) => new Date(r.date) >= monthStart);
  const monthIncome = monthTx.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const monthExpense = monthTx.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const expenseBy = new Map<string, number>();
  for (const r of monthTx) {
    if (r.type !== "expense") continue;
    expenseBy.set(r.category, (expenseBy.get(r.category) ?? 0) + r.amount);
  }
  const topExpenseCategories = [...expenseBy.entries()]
    .map(([category, total]) => ({ category, total, label: formatKwacha(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  const recentActivities = allRows(activities)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 6)
    .map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      date: a.date,
      details: a.details ?? null,
      linkLabel:
        (a.animalId ? animalMap.get(a.animalId)?.tagId : undefined) ??
        (a.fieldId ? fieldMap.get(a.fieldId)?.name : undefined) ??
        (a.cropCycleId ? cropMap.get(a.cropCycleId)?.crop : undefined) ??
        (a.groupId ? groupMap.get(a.groupId)?.name : undefined) ??
        null,
    }));

  return {
    attention: {
      overdueTasks: overdue.length,
      dueTodayTasks: dueToday.length,
      overdueVaccinations: overdueVaccinations.length,
      nearingHarvest: nearingHarvest.length,
    },
    glance: {
      livestockTotal: allRows(animals).filter((a) => a.status === "active").length,
      groupTotal: allRows(groups).filter((g) => g.status === "active").length,
      activeCrops: activeCrops.length,
      fieldsTotal: allRows(fields).length,
      openTasks: openTasks.length,
    },
    tasks: {
      overdue: overdue.slice(0, 5).map(withLinks),
      overdueCount: overdue.length,
      dueToday: dueToday.slice(0, 5).map(withLinks),
      dueTodayCount: dueToday.length,
      upcoming: upcoming.slice(0, 5).map(withLinks),
    },
    vaccinations: {
      overdue: overdueVaccinations.slice(0, 3),
      soon: soonVaccinations.slice(0, 5),
    },
    crops: {
      active: activeCrops.slice(0, 4).map((c) => ({
        id: c.id, crop: c.crop, variety: c.variety ?? null,
        field: c.fieldId ? fieldMap.get(c.fieldId)?.name ?? null : null,
        status: c.status, expectedHarvestDate: c.expectedHarvestDate ?? null,
      })),
      nearingHarvest: nearingHarvest.slice(0, 3),
    },
    finances: {
      monthIncome,
      monthExpense,
      monthNet: monthIncome - monthExpense,
      topExpenseCategories,
    },
    recentActivities,
    todayISO: today.toISOString(),
  };
}

/**
 * Local mirror of GET /api/summary (r9) — keeps the shell badges working
 * offline. Reuses the local dashboard computation and adds the 30-day
 * upcoming-vaccination count it slices away.
 */
async function getSummary(): Promise<SummaryCounts> {
  const [d, vaccinations] = await Promise.all([getDashboard(), farmDb.vaccinations.toArray()]);
  const today = startOfToday();
  let upcomingVaccinations = 0;
  for (const v of allRows(vaccinations)) {
    if (!v.nextDueDate) continue;
    const due = new Date(v.nextDueDate);
    const days = Math.round(
      (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
        new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
        86_400_000
    );
    if (days >= 0 && days <= 30) upcomingVaccinations++;
  }
  return {
    livestockTotal: d.glance.livestockTotal,
    groupTotal: d.glance.groupTotal,
    activeCrops: d.glance.activeCrops,
    fieldsTotal: d.glance.fieldsTotal,
    openTasks: d.glance.openTasks,
    overdueTasks: d.attention.overdueTasks,
    dueTodayTasks: d.attention.dueTodayTasks,
    upcomingVaccinations,
    overdueVaccinations: d.attention.overdueVaccinations,
    monthIncome: d.finances.monthIncome,
    monthExpense: d.finances.monthExpense,
  };
}

async function getReports(params: URLSearchParams): Promise<ReportsPayloadDTO> {
  const parse = (v: string | null): Date | undefined => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const today = startOfToday();
  const financeFrom = parse(params.get("from")) ?? new Date(today.getFullYear(), 0, 1);
  const financeTo = parse(params.get("to"));
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const last30 = new Date(today);
  last30.setDate(last30.getDate() - 30);

  const [animals, groups, events, vaccinations, crops, fields, transactions, tasks, activities, weights] =
    await Promise.all([
      farmDb.animals.toArray(),
      farmDb.groups.toArray(),
      farmDb.healthEvents.toArray(),
      farmDb.vaccinations.toArray(),
      farmDb.crops.toArray(),
      farmDb.fields.toArray(),
      farmDb.transactions.toArray(),
      farmDb.tasks.toArray(),
      farmDb.activities.toArray(),
      farmDb.weightRecords.toArray(),
    ]);

  // Livestock
  const activeAnimals = allRows(animals).filter((a) => a.status === "active");
  const speciesMap = new Map<string, number>();
  for (const a of activeAnimals) speciesMap.set(a.species, (speciesMap.get(a.species) ?? 0) + 1);
  const bySpecies = [...speciesMap.entries()].map(([species, count]) => ({ species, count })).sort((a, b) => b.count - a.count);

  // Health
  let vaccinationsDue30 = 0;
  let overdueVaccinations = 0;
  for (const v of allRows(vaccinations)) {
    if (!v.nextDueDate) continue;
    const due = new Date(v.nextDueDate);
    const day = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    if (day < today) overdueVaccinations++;
    else if (due <= new Date(today.getTime() + 30 * 86_400_000)) vaccinationsDue30++;
  }
  const last30Events = allRows(events).filter((e) => new Date(e.date) >= last30).length;

  // Crops
  const activeCyclesOut = allRows(crops)
    .filter((c) => c.status === "planned" || c.status === "growing")
    .sort((a, b) => Date.parse(b.plantingDate ?? b.createdAt) - Date.parse(a.plantingDate ?? a.createdAt))
    .map((c) => ({
      id: c.id, crop: c.crop, variety: c.variety ?? null,
      field: c.fieldId ? fields.find((f) => f.id === c.fieldId)?.name ?? null : null,
      status: c.status, plantingDate: c.plantingDate ?? null, expectedHarvestDate: c.expectedHarvestDate ?? null,
    }));
  const harvestedThisYear = allRows(crops)
    .filter((c) => c.status === "harvested" && c.actualHarvestDate && new Date(c.actualHarvestDate) >= yearStart)
    .sort((a, b) => Date.parse(b.actualHarvestDate!) - Date.parse(a.actualHarvestDate!))
    .map((c) => ({ crop: c.crop, quantity: c.harvestQuantity ?? null, unit: c.harvestUnit ?? null, saleAmount: c.saleAmount ?? null }));

  // Finance
  const inFinanceRange = allRows(transactions).filter((r) => {
    const d = new Date(r.date);
    return d >= financeFrom && (!financeTo || d <= financeTo);
  });
  const sumCat = (type: string) => {
    const m = new Map<string, number>();
    for (const r of inFinanceRange) {
      if (r.type !== type) continue;
      m.set(r.category, (m.get(r.category) ?? 0) + r.amount);
    }
    return [...m.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  };
  const income = inFinanceRange.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const expense = inFinanceRange.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);

  // Tasks
  let overdue = 0;
  let openTotal = 0;
  const openByCategory = new Map<string, number>();
  for (const t of allRows(tasks)) {
    if (t.status !== "open") continue;
    openTotal++;
    if (new Date(t.dueDate) < today) overdue++;
    openByCategory.set(t.category, (openByCategory.get(t.category) ?? 0) + 1);
  }
  const tasksByCategory = [...openByCategory.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
  const completed30 = allRows(tasks).filter(
    (t) => t.status === "done" && t.completedAt && new Date(t.completedAt) >= last30
  ).length;

  // Activities last 30 days
  const act30 = new Map<string, number>();
  for (const a of allRows(activities)) {
    if (new Date(a.date) < last30) continue;
    act30.set(a.type, (act30.get(a.type) ?? 0) + 1);
  }
  const last30ByType = [...act30.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

  // Weight gain (trailing 90 days, falls back to the two latest weigh-ins)
  const WINDOW_DAYS = 90;
  const win90 = new Date(today);
  win90.setDate(win90.getDate() - WINDOW_DAYS);
  const weightGainRows = activeAnimals
    .map((a) => ({
      animal: a,
      records: weights
        .filter((w) => w.animalId === a.id && !w.deletedAt)
        .sort((x, y) => Date.parse(x.recordedAt) - Date.parse(y.recordedAt)),
    }))
    .filter(({ records }) => records.length >= 2)
    .map(({ animal: a, records }) => {
      const inWindow = records.filter((r) => new Date(r.recordedAt) >= win90);
      const pair = inWindow.length >= 2
        ? [inWindow[0], inWindow[inWindow.length - 1]]
        : [records[records.length - 2], records[records.length - 1]];
      const [first, last] = pair;
      const days = Math.max(1, Math.round((Date.parse(last.recordedAt) - Date.parse(first.recordedAt)) / 86_400_000));
      const gainKg = Number((last.weightKg - first.weightKg).toFixed(1));
      return {
        animalId: a.id,
        label: a.name ? `${a.tagId} · ${a.name}` : a.tagId,
        species: a.species,
        fromKg: first.weightKg,
        toKg: last.weightKg,
        currentKg: a.weightKg ?? last.weightKg,
        targetKg: a.targetWeightKg ?? null,
        fromDate: first.recordedAt,
        toDate: last.recordedAt,
        days,
        gainKg,
        adgKg: Number((gainKg / days).toFixed(3)),
        approx: inWindow.length < 2,
      };
    })
    .sort((a, b) => b.gainKg - a.gainKg);
  const gaining = weightGainRows.filter((r) => r.gainKg > 0).length;
  const losing = weightGainRows.filter((r) => r.gainKg < 0).length;
  const herdAvgAdg = weightGainRows.length > 0
    ? Number((weightGainRows.reduce((s, r) => s + r.adgKg, 0) / weightGainRows.length).toFixed(3))
    : 0;

  return {
    generatedAt: nowIso(),
    livestock: {
      bySpecies,
      totalActive: activeAnimals.length,
      groupsCount: allRows(groups).filter((g) => g.status === "active").length,
      recentDeaths: allRows(events).filter((e) => e.type === "death" && new Date(e.date) >= last30).length,
    },
    health: { vaccinationsDue30, overdueVaccinations, last30Events },
    crops: {
      activeCycles: activeCyclesOut,
      harvestedThisYear,
      fieldsCount: allRows(fields).length,
      totalArea: allRows(fields).reduce((s, f) => s + (f.areaHa ?? 0), 0) || null,
    },
    finance: {
      from: iso(financeFrom),
      to: iso(financeTo ?? null),
      income,
      expense,
      byCategoryIncome: sumCat("income"),
      byCategoryExpense: sumCat("expense"),
    },
    tasks: { completed30, overdue, openTotal, byCategory: tasksByCategory },
    activities: { last30ByType },
    weightGain: { windowDays: WINDOW_DAYS, rows: weightGainRows, gaining, losing, herdAvgAdg },
  };
}

// ---------------------------------------------------------------------------
// Weather (online enhancement with cached fallback)
// ---------------------------------------------------------------------------

async function getWeather(): Promise<WeatherDataDTO & { stale: boolean }> {
  const online = typeof navigator !== "undefined" && navigator.onLine;
  if (online) {
    try {
      const res = await fetch("/api/weather", { cache: "no-store" });
      if (res.ok) {
        const payload = (await res.json()) as WeatherDataDTO;
        // The service worker may serve a cached API response when the server
        // is unreachable, so judge freshness by the payload's own timestamp:
        // older than 45 minutes (or served from the server's DB cache) counts
        // as stale and the UI says so honestly.
        const ageMs = Date.now() - Date.parse(payload.fetchedAt);
        const stale = payload.cached === true || !Number.isFinite(ageMs) || ageMs > 45 * 60_000;
        await farmDb.weatherCache.put({ id: "current", payload, fetchedAt: nowIso() });
        return { ...payload, stale };
      }
    } catch {
      /* fall through to cache */
    }
  }
  const cached = await farmDb.weatherCache.get("current");
  if (cached) {
    return { ...cached.payload, cached: true, fetchedAt: cached.fetchedAt, stale: true };
  }
  throw new Error(
    online
      ? "Weather is unavailable right now."
      : "Weather needs an internet connection — showing nothing yet because there is no cached forecast for this device."
  );
}

// ---------------------------------------------------------------------------
// Backup / restore (local, works offline)
// ---------------------------------------------------------------------------

async function exportBackup() {
  const settingsRows = await farmDb.settings.toArray();
  const settings: Record<string, string> = {};
  for (const r of allRows(settingsRows)) settings[r.key] = r.value;
  const [groups, animals, weightRecords, healthEvents, vaccinations, fields, crops, activities, tasks, transactions, knowledge, rainfall, mapItems] =
    await Promise.all([
      farmDb.groups.toArray(), farmDb.animals.toArray(), farmDb.weightRecords.toArray(),
      farmDb.healthEvents.toArray(), farmDb.vaccinations.toArray(), farmDb.fields.toArray(),
      farmDb.crops.toArray(), farmDb.activities.toArray(), farmDb.tasks.toArray(),
      farmDb.transactions.toArray(), farmDb.knowledge.toArray(), farmDb.rainfall.toArray(),
      farmDb.mapItems.toArray(),
    ]);
  return {
    app: "farm-command",
    version: 2,
    exportedAt: nowIso(),
    settings,
    data: {
      groups: allRows(groups),
      animals: allRows(animals),
      weightRecords: allRows(weightRecords),
      healthEvents: allRows(healthEvents),
      vaccinations: allRows(vaccinations),
      fields: allRows(fields),
      crops: allRows(crops),
      activities: allRows(activities),
      tasks: allRows(tasks),
      transactions: allRows(transactions),
      knowledge: allRows(knowledge),
      rainfall: allRows(rainfall),
      mapItems: allRows(mapItems),
    },
  };
}

async function importBackup(doc: { settings?: Record<string, string>; data?: Record<string, Record<string, unknown>[]> }): Promise<BackupCountsResponse> {
  if (!doc || typeof doc !== "object" || !doc.data) {
    throw new Error("This file does not look like a Farm Command backup.");
  }
  const tables: [string, Record<string, unknown>[]][] = [
    ["groups", doc.data.groups ?? []],
    ["animals", doc.data.animals ?? []],
    ["weightRecords", doc.data.weightRecords ?? []],
    ["healthEvents", doc.data.healthEvents ?? []],
    ["vaccinations", doc.data.vaccinations ?? []],
    ["fields", doc.data.fields ?? []],
    ["crops", doc.data.crops ?? []],
    ["activities", doc.data.activities ?? []],
    ["tasks", doc.data.tasks ?? []],
    ["transactions", doc.data.transactions ?? []],
    ["knowledge", doc.data.knowledge ?? []],
    ["rainfall", doc.data.rainfall ?? []],
    ["mapItems", doc.data.mapItems ?? []],
  ];
  // Wipe local data (keep outbox — queued changes still belong to the server flow)
  await farmDb.transaction(
    "rw",
    [farmDb.groups, farmDb.animals, farmDb.weightRecords, farmDb.healthEvents, farmDb.vaccinations,
      farmDb.fields, farmDb.crops, farmDb.activities, farmDb.tasks, farmDb.transactions,
      farmDb.knowledge, farmDb.rainfall, farmDb.mapItems],
    async () => {
      for (const [table] of tables) {
         
        await (farmDb as any).table(table).clear();
      }
    }
  );
  const counts: Record<string, number> = {};
  for (const [table, rows] of tables) {
    let n = 0;
    for (const row of rows) {
      if (!row || typeof row !== "object" || !row.id) continue;
      const rec = {
        ...row,
        createdAt: row.createdAt ?? nowIso(),
        updatedAt: row.updatedAt ?? nowIso(),
        deletedAt: row.deletedAt ?? null,
      } as never;
       
      await (farmDb as any).table(table).put(rec);
      await queueChange(table, String(row.id), "put");
      n++;
    }
    counts[table] = n;
  }
  // Settings
  if (doc.settings && typeof doc.settings === "object") {
    for (const [key, value] of Object.entries(doc.settings)) {
      if (key in DEFAULT_SETTINGS) {
        const now = nowIso();
        await farmDb.settings.put({ key, value: String(value), createdAt: now, updatedAt: now } as SettingsRow);
        await queueChange("settings", key, "put");
      }
    }
  }
  notifyDataChanged();
  return counts as unknown as BackupCountsResponse;
}

// ---------------------------------------------------------------------------
// Vaccination ↔ reminder task sync (local port of the server contract)
// ---------------------------------------------------------------------------

async function targetLabelFor(animalId?: string | null, groupId?: string | null): Promise<string> {
  if (animalId) {
    const a = await farmDb.animals.get(animalId);
    if (a) return a.name ? `${a.tagId} ${a.name}` : a.tagId;
  }
  if (groupId) {
    const g = await farmDb.groups.get(groupId);
    if (g) return g.name;
  }
  return "farm";
}

/** Create/update/delete the open reminder Task linked to a vaccination's next-due date. */
async function syncVaccinationReminder(vaccination: {
  id: string;
  vaccineName: string;
  nextDueDate?: string | null | undefined;
  animalId?: string | null | undefined;
  groupId?: string | null | undefined;
}): Promise<string | null> {
  const openTasks = allRows(await farmDb.tasks.toArray());
  const existing = openTasks.find((t) => t.vaccinationId === vaccination.id && t.status === "open");
  const settings = await getSettings();
  const leadTimeDays = settings.reminderLeadDays >= 0 ? settings.reminderLeadDays : 3;

  if (!vaccination.nextDueDate) {
    if (existing) await deleteLocal("tasks", existing.id);
    return null;
  }
  const nextDue = vaccination.nextDueDate;

  const label = await targetLabelFor(vaccination.animalId, vaccination.groupId);
  const body: TaskRow = {
    id: existing?.id ?? newId(),
    title: `${vaccination.vaccineName} due — ${label}`,
    description: "Vaccination next-due reminder generated automatically.",
    category: "health",
    dueDate: nextDue,
    dueTime: null,
    priority: Date.parse(nextDue) < Date.now() ? "high" : "medium",
    repeatRule: "once",
    repeatIntervalDays: null,
    leadTimeDays,
    animalId: vaccination.animalId,
    groupId: vaccination.groupId,
    cropCycleId: null,
    fieldId: null,
    assignee: null,
    status: "open",
    completedAt: null,
    nextOccurrenceId: null,
    vaccinationId: vaccination.id,
    notes: null,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    deletedAt: null,
  };
  await putLocal("tasks", body);
  return body.id;
}

// ---------------------------------------------------------------------------
// Task recurrence (local port of the complete contract)
// ---------------------------------------------------------------------------

function nextDueFor(task: TaskRow): Date {
  const base = new Date(task.dueDate);
  switch (task.repeatRule) {
    case "daily":
      return addDays(base, 1);
    case "weekly":
      return addDays(base, 7);
    case "monthly":
      return addMonths(base, 1);
    case "custom_days":
      return addDays(base, task.repeatIntervalDays ?? 0);
    default:
      return base;
  }
}

async function completeTask(id: string): Promise<{ completed: TaskWithLinksDTO; next: TaskWithLinksDTO | null }> {
  const task = await farmDb.tasks.get(id);
  if (!task || task.deletedAt) throw new Error("Task not found");
  if (task.status === "done") throw new Error("Task is already completed");
  if (task.status === "cancelled") throw new Error("Cannot complete a cancelled task");

  let nextId: string | null = null;
  const isRecurring = task.repeatRule !== "once";
  const customInterval = task.repeatRule === "custom_days" ? task.repeatIntervalDays ?? 0 : 0;
  if (isRecurring && (task.repeatRule !== "custom_days" || customInterval > 0)) {
    const next: TaskRow = {
      ...task,
      id: newId(),
      dueDate: nextDueFor(task).toISOString(),
      status: "open",
      completedAt: null,
      nextOccurrenceId: null,
      vaccinationId: null, // never carry vaccination linkage forward
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
    };
    await putLocal("tasks", next);
    nextId = next.id;
  }
  const completed = await putLocal("tasks", {
    ...task,
    status: "done",
    completedAt: nowIso(),
    nextOccurrenceId: nextId,
    updatedAt: nowIso(),
  });
  const next = nextId ? await farmDb.tasks.get(nextId) : null;
  return {
    completed: { ...completed, animal: null, group: null, cropCycle: null, field: null },
    next: next ? { ...next, animal: null, group: null, cropCycle: null, field: null } : null,
  };
}

async function snoozeTask(id: string, days: number): Promise<TaskWithLinksDTO> {
  const task = await farmDb.tasks.get(id);
  if (!task || task.deletedAt) throw new Error("Task not found");
  if (task.status === "done") throw new Error("Cannot snooze a completed task");
  if (task.status === "cancelled") throw new Error("Cannot snooze a cancelled task");
  const updated = await putLocal("tasks", {
    ...task,
    dueDate: addDays(new Date(task.dueDate), days).toISOString(),
    updatedAt: nowIso(),
  });
  return { ...updated, animal: null, group: null, cropCycle: null, field: null };
}

// ---------------------------------------------------------------------------
// Harvest (local port)
// ---------------------------------------------------------------------------

async function harvestCrop(id: string, body: {
  actualHarvestDate?: string | null;
  harvestQuantity: number;
  harvestUnit?: string | null;
  saleAmount?: number | null;
  recordSale?: boolean;
}): Promise<{ crop: CropCycleWithFieldDTO; transaction: { id: string; amount: number; category: string; description: string } | null }> {
  const cycle = await farmDb.crops.get(id);
  if (!cycle || cycle.deletedAt) throw new Error("Crop cycle not found");
  const harvestDate = body.actualHarvestDate ? new Date(body.actualHarvestDate) : new Date();
  const unit = body.harvestUnit?.trim() || "kg";
  const saleAmount = typeof body.saleAmount === "number" && isFinite(body.saleAmount) && body.saleAmount > 0 ? body.saleAmount : null;

  const updated = await putLocal("crops", {
    ...cycle,
    status: "harvested",
    actualHarvestDate: harvestDate.toISOString(),
    harvestQuantity: body.harvestQuantity,
    harvestUnit: unit,
    saleAmount,
    updatedAt: nowIso(),
  });

  let transaction: { id: string; amount: number; category: string; description: string } | null = null;
  if (body.recordSale && saleAmount && saleAmount > 0) {
    const now = nowIso();
    const tx: TransactionRow = {
      id: newId(),
      type: "income",
      category: "Crop sales",
      amount: saleAmount,
      date: harvestDate.toISOString(),
      description: `${cycle.crop} sale — ${body.harvestQuantity} ${unit}`,
      paymentMethod: null,
      receipt: null,
      cropCycleId: id,
      fieldId: cycle.fieldId,
      animalId: null,
      groupId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("transactions", tx);
    transaction = { id: tx.id, amount: tx.amount, category: tx.category, description: tx.description };
  }
  const field = updated.fieldId ? await farmDb.fields.get(updated.fieldId) : null;
  return { crop: { ...updated, field: fieldRef(field ?? undefined) }, transaction };
}

// ---------------------------------------------------------------------------
// Weight record (updates the animal's current weight, like the server)
// ---------------------------------------------------------------------------

async function createWeightRecord(animalId: string, body: { weightKg: number; recordedAt?: string; note?: string | null }): Promise<WeightRecordRow> {
  const animal = await farmDb.animals.get(animalId);
  if (!animal || animal.deletedAt) throw new Error("Animal not found");
  const now = nowIso();
  const record: WeightRecordRow = {
    id: newId(),
    animalId,
    weightKg: body.weightKg,
    recordedAt: body.recordedAt ? new Date(body.recordedAt).toISOString() : now,
    note: body.note ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await putLocal("weightRecords", record);
  await putLocal("animals", { ...animal, weightKg: body.weightKg, updatedAt: now });
  return record;
}

// ---------------------------------------------------------------------------
// Seed / reset (local — identical dataset to the server route)
// ---------------------------------------------------------------------------

async function seedLocally(): Promise<void> {
  const dataset = buildSeedDataset();
  await farmDb.transaction(
    "rw",
    [farmDb.groups, farmDb.animals, farmDb.weightRecords, farmDb.healthEvents, farmDb.vaccinations,
      farmDb.fields, farmDb.crops, farmDb.activities, farmDb.tasks, farmDb.transactions,
      farmDb.knowledge, farmDb.rainfall],
    async () => {
      await farmDb.weightRecords.clear();
      await farmDb.rainfall.clear();
      await farmDb.mapItems.clear();
      await farmDb.healthEvents.clear();
      await farmDb.vaccinations.clear();
      await farmDb.tasks.clear();
      await farmDb.activities.clear();
      await farmDb.transactions.clear();
      await farmDb.crops.clear();
      await farmDb.fields.clear();
      await farmDb.animals.clear();
      await farmDb.groups.clear();
      await farmDb.knowledge.clear();
    }
  );
  const tables: [string, { id: string }[]][] = [
    ["groups", dataset.groups],
    ["animals", dataset.animals],
    ["weightRecords", dataset.weightRecords],
    ["healthEvents", dataset.healthEvents],
    ["vaccinations", dataset.vaccinations],
    ["tasks", dataset.tasks],
    ["fields", dataset.fields],
    ["crops", dataset.crops],
    ["activities", dataset.activities],
    ["transactions", dataset.transactions],
    ["knowledge", dataset.knowledge],
    ["rainfall", dataset.rainfall],
  ];
  for (const [table, rows] of tables) {
    for (const row of rows) {
       
      await (farmDb as any).table(table).put(row);
      await queueChange(table, row.id, "put");
    }
  }
  notifyDataChanged();
}

async function resetLocally(withSettings: boolean): Promise<void> {
  await farmDb.transaction(
    "rw",
    [farmDb.groups, farmDb.animals, farmDb.weightRecords, farmDb.healthEvents, farmDb.vaccinations,
      farmDb.fields, farmDb.crops, farmDb.activities, farmDb.tasks, farmDb.transactions,
      farmDb.knowledge, farmDb.rainfall, farmDb.mapItems, farmDb.settings,
      farmDb.weatherCache, farmDb.notifLog],
    async () => {
      await farmDb.weightRecords.clear();
      await farmDb.rainfall.clear();
      await farmDb.mapItems.clear();
      await farmDb.healthEvents.clear();
      await farmDb.vaccinations.clear();
      await farmDb.tasks.clear();
      await farmDb.activities.clear();
      await farmDb.transactions.clear();
      await farmDb.crops.clear();
      await farmDb.fields.clear();
      await farmDb.animals.clear();
      await farmDb.groups.clear();
      await farmDb.knowledge.clear();
      await farmDb.weatherCache.clear();
      await farmDb.notifLog.clear();
      if (withSettings) await farmDb.settings.clear();
    }
  );
  notifyDataChanged();
}

// ---------------------------------------------------------------------------
// CSV export (local)
// ---------------------------------------------------------------------------

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function datePart(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

async function exportCsv(table: string): Promise<string> {
  const { animals, groups, fields, crops } = await buildLookups();
  const animalLabel = (id?: string | null) => {
    if (!id) return "";
    const a = animals.get(id);
    return a ? (a.name ? `${a.tagId} (${a.name})` : a.tagId) : "";
  };
  const groupName = (id?: string | null) => (id ? groups.get(id)?.name ?? "" : "");
  const fieldName = (id?: string | null) => (id ? fields.get(id)?.name ?? "" : "");
  const cropLabel = (id?: string | null) => {
    if (!id) return "";
    const c = crops.get(id);
    return c ? c.variety ? `${c.crop} (${c.variety})` : c.crop : "";
  };
  const tables: Record<string, { rows: Record<string, unknown>[]; cols: [string, (r: Record<string, unknown>) => unknown][] }> = {
    animals: {
      rows: allRows(await farmDb.animals.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Tag ID", (r) => r.tagId], ["Name", (r) => r.name], ["Species", (r) => r.species], ["Breed", (r) => r.breed],
        ["Sex", (r) => r.sex], ["Birth date", (r) => datePart(r.birthDate as string)], ["Status", (r) => r.status],
        ["Weight (kg)", (r) => r.weightKg], ["Target weight (kg)", (r) => r.targetWeightKg],
        ["Group", (r) => groupName(r.groupId as string)], ["Location", (r) => r.location],
        ["Acquisition", (r) => r.acquisition], ["Notes", (r) => r.notes],
      ],
    },
    groups: {
      rows: allRows(await farmDb.groups.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Name", (r) => r.name], ["Species", (r) => r.species], ["Breed", (r) => r.breed], ["Count", (r) => r.count],
        ["Location", (r) => r.location], ["Status", (r) => r.status], ["Notes", (r) => r.notes],
      ],
    },
    tasks: {
      rows: allRows(await farmDb.tasks.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Title", (r) => r.title], ["Category", (r) => r.category], ["Due date", (r) => datePart(r.dueDate as string)],
        ["Due time", (r) => r.dueTime], ["Priority", (r) => r.priority], ["Repeat", (r) => r.repeatRule],
        ["Status", (r) => r.status], ["Assignee", (r) => r.assignee],
        ["Animal", (r) => animalLabel(r.animalId as string)], ["Group", (r) => groupName(r.groupId as string)],
        ["Field", (r) => fieldName(r.fieldId as string)], ["Notes", (r) => r.notes],
      ],
    },
    transactions: {
      rows: allRows(await farmDb.transactions.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Type", (r) => r.type], ["Category", (r) => r.category], ["Amount (ZMW)", (r) => r.amount],
        ["Date", (r) => datePart(r.date as string)], ["Description", (r) => r.description],
        ["Payment method", (r) => r.paymentMethod],
        ["Animal", (r) => animalLabel(r.animalId as string)], ["Group", (r) => groupName(r.groupId as string)],
        ["Field", (r) => fieldName(r.fieldId as string)], ["Crop", (r) => cropLabel(r.cropCycleId as string)],
      ],
    },
    vaccinations: {
      rows: allRows(await farmDb.vaccinations.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Animal", (r) => animalLabel(r.animalId as string)], ["Group", (r) => groupName(r.groupId as string)],
        ["Vaccine", (r) => r.vaccineName], ["Date given", (r) => datePart(r.dateGiven as string)],
        ["Next due", (r) => datePart(r.nextDueDate as string)], ["Batch", (r) => r.batchNumber],
        ["Administered by", (r) => r.administeredBy], ["Notes", (r) => r.notes],
      ],
    },
    activities: {
      rows: allRows(await farmDb.activities.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Type", (r) => r.type], ["Title", (r) => r.title], ["Date", (r) => datePart(r.date as string)],
        ["Details", (r) => r.details], ["Cost (ZMW)", (r) => r.cost],
        ["Animal", (r) => animalLabel(r.animalId as string)], ["Group", (r) => groupName(r.groupId as string)],
        ["Field", (r) => fieldName(r.fieldId as string)], ["Crop", (r) => cropLabel(r.cropCycleId as string)],
      ],
    },
    fields: {
      rows: allRows(await farmDb.fields.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Name", (r) => r.name], ["Area (ha)", (r) => r.areaHa], ["Location", (r) => r.location],
        ["Soil notes", (r) => r.soilNotes], ["Irrigation", (r) => r.irrigation], ["Notes", (r) => r.notes],
      ],
    },
    crops: {
      rows: allRows(await farmDb.crops.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Crop", (r) => r.crop], ["Variety", (r) => r.variety], ["Field", (r) => fieldName(r.fieldId as string)],
        ["Planted", (r) => datePart(r.plantingDate as string)], ["Expected harvest", (r) => datePart(r.expectedHarvestDate as string)],
        ["Actual harvest", (r) => datePart(r.actualHarvestDate as string)], ["Quantity", (r) => r.harvestQuantity],
        ["Unit", (r) => r.harvestUnit], ["Sale amount (ZMW)", (r) => r.saleAmount], ["Status", (r) => r.status],
        ["Notes", (r) => r.notes],
      ],
    },
    "health-events": {
      rows: allRows(await farmDb.healthEvents.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Animal", (r) => animalLabel(r.animalId as string)], ["Group", (r) => groupName(r.groupId as string)],
        ["Type", (r) => r.type], ["Title", (r) => r.title], ["Date", (r) => datePart(r.date as string)],
        ["Details", (r) => r.details], ["Administered by", (r) => r.administeredBy],
        ["Medication", (r) => r.medication], ["Withdrawal days", (r) => r.withdrawalDays],
      ],
    },
    "weight-records": {
      rows: allRows(await farmDb.weightRecords.toArray()) as unknown as Record<string, unknown>[],
      cols: [
        ["Animal", (r) => animalLabel(r.animalId as string)], ["Weight (kg)", (r) => r.weightKg],
        ["Recorded at", (r) => datePart(r.recordedAt as string)], ["Note", (r) => r.note],
      ],
    },
  };
  const t = tables[table];
  if (!t) throw new Error(`Unknown export table: ${table}`);
  const header = t.cols.map(([h]) => csvCell(h)).join(",");
  const lines = t.rows.map((r) => t.cols.map(([, get]) => csvCell(get(r))).join(","));
  return [header, ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// Settings PATCH (local)
// ---------------------------------------------------------------------------

async function patchSettings(body: Record<string, unknown>): Promise<FarmSettingsData> {
  const current = await getSettings();
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...current, ...body })) {
    if (key in DEFAULT_SETTINGS) {
      // Structured values (e.g. the expenseBudgets record) are stored as JSON
      // strings; re-merging an already-parsed object must re-stringify it,
      // never String()-collapse it to "[object Object]".
      merged[key] =
        typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
    }
  }
  const existing = new Map((await farmDb.settings.toArray()).map((r) => [r.key, r]));
  const now = nowIso();
  for (const [key, value] of Object.entries(merged)) {
    const prev = existing.get(key);
    const row: SettingsRow = {
      key,
      value,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    };
    if (!prev || prev.value !== value) {
      await farmDb.settings.put(row);
      await queueChange("settings", key, "put");
    }
  }
  return parseSettings(merged);
}

// ---------------------------------------------------------------------------
// Facade: apiGet / apiSend
// ---------------------------------------------------------------------------

export class OfflineError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = new URL(path, "http://local");
  const p = url.pathname;
  const params = url.searchParams;

  // ----- local database reads -----
  if (p === "/api/settings") return getSettings() as Promise<T>;
  if (p === "/api/dashboard") return getDashboard() as Promise<T>;
  if (p === "/api/summary") return getSummary() as Promise<T>;
  if (p === "/api/animals") return getAnimals() as Promise<T>;
  if (p === "/api/groups") return getGroups(params) as Promise<T>;
  if (p === "/api/health-events") return getHealthEvents(params) as Promise<T>;
  if (p === "/api/vaccinations") return getVaccinations(params) as Promise<T>;
  if (p === "/api/tasks") return getTasks() as Promise<T>;
  if (p === "/api/fields") return getFieldsWithCycles() as Promise<T>;
  if (p === "/api/crops") return getCropsWithField() as Promise<T>;
  if (p === "/api/activities") return getActivities(params) as Promise<T>;
  if (p === "/api/finance") return getFinanceRows(params) as Promise<T>;
  if (p === "/api/finance/summary") return getFinanceSummary(params) as Promise<T>;
  if (p === "/api/knowledge") return getKnowledge() as Promise<T>;
  if (p === "/api/rainfall") return getRainfall() as Promise<T>;
  if (p === "/api/map") return getMapItems() as Promise<T>;
  if (p === "/api/poultry") return getFlocks(params) as Promise<T>;
  if (p === "/api/reports") return getReports(params) as Promise<T>;
  if (p === "/api/backup") return exportBackup() as Promise<T>;
  if (p === "/api/weather") return getWeather() as Promise<T>;

  // /api/animals/{id} | /api/animals/{id}/weights | /api/groups/{id}
  const animalMatch = p.match(/^\/api\/animals\/([^/]+)$/);
  if (animalMatch) {
    const animal = await getAnimal(animalMatch[1]);
    if (!animal) throw new OfflineError("Animal not found", 404);
    return animal as T;
  }
  const weightsMatch = p.match(/^\/api\/animals\/([^/]+)\/weights$/);
  if (weightsMatch) return getWeights(weightsMatch[1]) as Promise<T>;
  const groupMatch = p.match(/^\/api\/groups\/([^/]+)$/);
  if (groupMatch) {
    const g = await farmDb.groups.get(groupMatch[1]);
    if (!g || g.deletedAt) throw new OfflineError("Group not found", 404);
    return g as T;
  }

  // /api/poultry/{id} | /api/poultry/{id}/eggs
  const flockMatch = p.match(/^\/api\/poultry\/([^/]+)$/);
  if (flockMatch) {
    const f = await getFlock(flockMatch[1]);
    if (!f) throw new OfflineError("Flock not found", 404);
    return f as T;
  }
  const eggsMatch = p.match(/^\/api\/poultry\/([^/]+)\/eggs$/);
  if (eggsMatch) return getEggs(eggsMatch[1]) as Promise<T>;

  // Unknown path → try the network when online (safety net for future endpoints)
  if (typeof navigator !== "undefined" && navigator.onLine) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new OfflineError(`Request failed (${res.status})`, res.status);
    return res.json() as Promise<T>;
  }
  throw new OfflineError("This feature needs an internet connection and you are offline.");
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const url = new URL(path, "http://local");
  const p = url.pathname;
  const params = url.searchParams;
  const b = (body ?? {}) as Record<string, unknown>;
  const now = nowIso();

  // ---------- settings ----------
  if (p === "/api/settings" && method === "PATCH") return patchSettings(b) as Promise<T>;

  // ---------- seed / reset ----------
  if (p === "/api/seed" && method === "POST") {
    if (b.action === "seed") await seedLocally();
    else if (b.action === "reset") await resetLocally(Boolean(b.withSettings));
    else throw new OfflineError("Unknown seed action");
    return { ok: true } as T;
  }

  // ---------- backup ----------
  if (p === "/api/backup" && method === "POST") {
    const counts = await importBackup(b as never);
    return { ok: true, counts } as T;
  }

  // ---------- tasks ----------
  if (p === "/api/tasks" && method === "POST") {
    const row: TaskRow = {
      id: newId(),
      title: String(b.title ?? "").trim() || "Untitled task",
      description: (b.description as string) ?? null,
      category: (b.category as string) ?? "general",
      dueDate: new Date(b.dueDate as string).toISOString(),
      dueTime: (b.dueTime as string) ?? null,
      priority: (b.priority as string) ?? "medium",
      repeatRule: (b.repeatRule as string) ?? "once",
      repeatIntervalDays: (b.repeatIntervalDays as number) ?? null,
      leadTimeDays: typeof b.leadTimeDays === "number" ? b.leadTimeDays : 0,
      animalId: (b.animalId as string) ?? null,
      groupId: (b.groupId as string) ?? null,
      cropCycleId: (b.cropCycleId as string) ?? null,
      fieldId: (b.fieldId as string) ?? null,
      assignee: (b.assignee as string) ?? null,
      status: "open",
      completedAt: null,
      nextOccurrenceId: null,
      vaccinationId: (b.vaccinationId as string) ?? null,
      notes: (b.notes as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    if (!row.title) throw new OfflineError("Title is required", 400);
    await putLocal("tasks", row);
    return { ...row, animal: null, group: null, cropCycle: null, field: null } as T;
  }

  const taskMatch = p.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && method === "PUT") {
    const prev = await farmDb.tasks.get(taskMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Task not found", 404);
    const row: TaskRow = { ...prev, ...b, id: prev.id, createdAt: prev.createdAt, updatedAt: now } as TaskRow;
    await putLocal("tasks", row);
    return { ...row, animal: null, group: null, cropCycle: null, field: null } as T;
  }
  if (taskMatch && method === "DELETE") {
    await deleteLocal("tasks", taskMatch[1]);
    return { ok: true } as T;
  }
  const completeMatch = p.match(/^\/api\/tasks\/([^/]+)\/complete$/);
  if (completeMatch && method === "POST") return completeTask(completeMatch[1]) as Promise<T>;
  const snoozeMatch = p.match(/^\/api\/tasks\/([^/]+)\/snooze$/);
  if (snoozeMatch && method === "POST") return snoozeTask(snoozeMatch[1], Number(b.days ?? 1)) as Promise<T>;

  // ---------- vaccinations (with reminder task sync) ----------
  if (p === "/api/vaccinations" && method === "POST") {
    if (!b.animalId && !b.groupId) throw new OfflineError("Select an animal or a group for this record", 400);
    const row: VaccinationRow = {
      id: newId(),
      animalId: (b.animalId as string) ?? null,
      groupId: (b.groupId as string) ?? null,
      vaccineName: String(b.vaccineName ?? "").trim(),
      dateGiven: new Date(b.dateGiven as string).toISOString(),
      nextDueDate: b.nextDueDate ? new Date(b.nextDueDate as string).toISOString() : null,
      batchNumber: (b.batchNumber as string) ?? null,
      administeredBy: (b.administeredBy as string) ?? null,
      notes: (b.notes as string) ?? null,
      attachment: null,
      reminderTaskId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    if (!row.vaccineName) throw new OfflineError("Vaccine name is required", 400);
    row.reminderTaskId = await syncVaccinationReminder(row);
    await putLocal("vaccinations", row);
    return { ...row, animal: null, group: null } as T;
  }
  const vacMatch = p.match(/^\/api\/vaccinations\/([^/]+)$/);
  if (vacMatch && method === "PUT") {
    const prev = await farmDb.vaccinations.get(vacMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Vaccination not found", 404);
    const row: VaccinationRow = {
      ...prev,
      ...b,
      id: prev.id,
      nextDueDate: b.nextDueDate ? new Date(b.nextDueDate as string).toISOString() : null,
      createdAt: prev.createdAt,
      updatedAt: now,
    } as VaccinationRow;
    row.reminderTaskId = await syncVaccinationReminder(row);
    await putLocal("vaccinations", row);
    return { ...row, animal: null, group: null } as T;
  }
  if (vacMatch && method === "DELETE") {
    // delete the linked open reminder task too (server contract)
    const openTasks = allRows(await farmDb.tasks.toArray());
    for (const t of openTasks) {
      if (t.vaccinationId === vacMatch[1] && t.status === "open") await deleteLocal("tasks", t.id);
    }
    await deleteLocal("vaccinations", vacMatch[1]);
    return { ok: true } as T;
  }

  // ---------- health events ----------
  if (p === "/api/health-events" && method === "POST") {
    const row: HealthEventRow = {
      id: newId(),
      animalId: (b.animalId as string) ?? null,
      groupId: (b.groupId as string) ?? null,
      type: (b.type as string) ?? "note",
      title: String(b.title ?? "").trim() || "Health event",
      date: new Date(b.date as string).toISOString(),
      details: (b.details as string) ?? null,
      administeredBy: (b.administeredBy as string) ?? null,
      medication: (b.medication as string) ?? null,
      withdrawalDays: (b.withdrawalDays as number) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("healthEvents", row);
    return { ...row, animal: null, group: null } as T;
  }
  const hevMatch = p.match(/^\/api\/health-events\/([^/]+)$/);
  if (hevMatch && method === "PUT") {
    const prev = await farmDb.healthEvents.get(hevMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Health event not found", 404);
    const row = { ...prev, ...b, id: prev.id, createdAt: prev.createdAt, updatedAt: now } as HealthEventRow;
    await putLocal("healthEvents", row);
    return { ...row, animal: null, group: null } as T;
  }
  if (hevMatch && method === "DELETE") {
    await deleteLocal("healthEvents", hevMatch[1]);
    return { ok: true } as T;
  }

  // ---------- animals ----------
  if (p === "/api/animals" && method === "POST") {
    const tagId = String(b.tagId ?? "").trim();
    if (!tagId) throw new OfflineError("Tag ID is required", 400);
    const existing = (await farmDb.animals.toArray()).find(
      (a) => a.tagId.toLowerCase() === tagId.toLowerCase() && !a.deletedAt
    );
    if (existing) throw new OfflineError(`Tag ID "${tagId}" is already in use`, 400);
    const row: AnimalRow = {
      id: newId(),
      tagId,
      name: (b.name as string) ?? null,
      species: (b.species as string) ?? "Cattle",
      breed: (b.breed as string) ?? null,
      sex: (b.sex as string) ?? null,
      birthDate: b.birthDate ? new Date(b.birthDate as string).toISOString() : null,
      estimatedAge: (b.estimatedAge as string) ?? null,
      acquisition: (b.acquisition as string) ?? null,
      acquisitionDate: b.acquisitionDate ? new Date(b.acquisitionDate as string).toISOString() : null,
      location: (b.location as string) ?? null,
      status: (b.status as string) ?? "active",
      weightKg: (b.weightKg as number) ?? null,
      targetWeightKg: (b.targetWeightKg as number) ?? null,
      notes: (b.notes as string) ?? null,
      photo: (b.photo as string) ?? null,
      groupId: (b.groupId as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("animals", row);
    return { ...row, group: null } as T;
  }
  const animalMutMatch = p.match(/^\/api\/animals\/([^/]+)$/);
  if (animalMutMatch && method === "PUT") {
    const prev = await farmDb.animals.get(animalMutMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Animal not found", 404);
    const row = { ...prev, ...b, id: prev.id, tagId: b.tagId ? String(b.tagId).trim() : prev.tagId, createdAt: prev.createdAt, updatedAt: now } as AnimalRow;
    await putLocal("animals", row);
    return { ...row, group: null } as T;
  }
  if (animalMutMatch && method === "DELETE") {
    await deleteLocal("animals", animalMutMatch[1]);
    await cascadeDeleteAnimal(animalMutMatch[1]);
    notifyDataChanged();
    return { ok: true } as T;
  }

  // ---------- weights ----------
  const weightsPost = p.match(/^\/api\/animals\/([^/]+)\/weights$/);
  if (weightsPost && method === "POST") {
    const rec = await createWeightRecord(weightsPost[1], b as never);
    return rec as T;
  }
  const weightDel = p.match(/^\/api\/animals\/([^/]+)\/weights\/([^/]+)$/);
  if (weightDel && method === "DELETE") {
    await deleteLocal("weightRecords", weightDel[2]);
    return { ok: true } as T;
  }

  // ---------- groups ----------
  if (p === "/api/groups" && method === "POST") {
    const row: GroupRow = {
      id: newId(),
      name: String(b.name ?? "").trim() || "New group",
      species: (b.species as string) ?? "Cattle",
      breed: (b.breed as string) ?? null,
      count: typeof b.count === "number" ? b.count : 0,
      breedingMaleCount: typeof b.breedingMaleCount === "number" ? b.breedingMaleCount : 0,
      breedingFemaleCount: typeof b.breedingFemaleCount === "number" ? b.breedingFemaleCount : 0,
      youngCount: typeof b.youngCount === "number" ? b.youngCount : 0,
      castratedCount: typeof b.castratedCount === "number" ? b.castratedCount : 0,
      location: (b.location as string) ?? null,
      acquisition: (b.acquisition as string) ?? null,
      status: (b.status as string) ?? "active",
      notes: (b.notes as string) ?? null,
      photo: (b.photo as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("groups", row);
    return row as T;
  }
  const groupMutMatch = p.match(/^\/api\/groups\/([^/]+)$/);
  if (groupMutMatch && method === "PUT") {
    const prev = await farmDb.groups.get(groupMutMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Group not found", 404);
    const row = { ...prev, ...b, id: prev.id, createdAt: prev.createdAt, updatedAt: now } as GroupRow;
    await putLocal("groups", row);
    return row as T;
  }
  if (groupMutMatch && method === "DELETE") {
    await deleteLocal("groups", groupMutMatch[1]);
    await cascadeDeleteGroup(groupMutMatch[1]);
    notifyDataChanged();
    return { ok: true } as T;
  }

  // ---------- poultry (flocks + egg logs) ----------
  if (p === "/api/poultry" && method === "POST") {
    const row: PoultryFlockRow = {
      id: newId(),
      name: String(b.name ?? "").trim() || "New flock",
      birdType: (b.birdType as string) ?? "Chickens",
      breed: (b.breed as string) ?? null,
      count: typeof b.count === "number" ? b.count : 0,
      breedingMaleCount: typeof b.breedingMaleCount === "number" ? b.breedingMaleCount : 0,
      breedingFemaleCount: typeof b.breedingFemaleCount === "number" ? b.breedingFemaleCount : 0,
      youngCount: typeof b.youngCount === "number" ? b.youngCount : 0,
      castratedCount: typeof b.castratedCount === "number" ? b.castratedCount : 0,
      location: (b.location as string) ?? null,
      feedNote: (b.feedNote as string) ?? null,
      status: (b.status as string) ?? "active",
      notes: (b.notes as string) ?? null,
      photo: (b.photo as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("poultryFlocks", row);
    return row as T;
  }
  const flockEggsPost = p.match(/^\/api\/poultry\/([^/]+)\/eggs$/);
  if (flockEggsPost && method === "POST") {
    const rec = await createEggLog(flockEggsPost[1], b as never);
    return rec as T;
  }
  const eggDel = p.match(/^\/api\/poultry\/([^/]+)\/eggs\/([^/]+)$/);
  if (eggDel && method === "DELETE") {
    await deleteLocal("eggLogs", eggDel[2]);
    return { ok: true } as T;
  }
  const flockMutMatch = p.match(/^\/api\/poultry\/([^/]+)$/);
  if (flockMutMatch && method === "PUT") {
    const prev = await farmDb.poultryFlocks.get(flockMutMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Flock not found", 404);
    const row = { ...prev, ...b, id: prev.id, createdAt: prev.createdAt, updatedAt: now } as PoultryFlockRow;
    await putLocal("poultryFlocks", row);
    return row as T;
  }
  if (flockMutMatch && method === "DELETE") {
    await deleteLocal("poultryFlocks", flockMutMatch[1]);
    await cascadeDeleteFlock(flockMutMatch[1]);
    notifyDataChanged();
    return { ok: true } as T;
  }

  // ---------- fields ----------
  if (p === "/api/fields" && method === "POST") {
    const row: FieldRow = {
      id: newId(),
      name: String(b.name ?? "").trim() || "New field",
      areaHa: (b.areaHa as number) ?? null,
      location: (b.location as string) ?? null,
      soilNotes: (b.soilNotes as string) ?? null,
      irrigation: (b.irrigation as string) ?? null,
      notes: (b.notes as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("fields", row);
    return row as T;
  }
  const fieldMutMatch = p.match(/^\/api\/fields\/([^/]+)$/);
  if (fieldMutMatch && method === "PUT") {
    const prev = await farmDb.fields.get(fieldMutMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Field not found", 404);
    const row = { ...prev, ...b, id: prev.id, createdAt: prev.createdAt, updatedAt: now } as FieldRow;
    await putLocal("fields", row);
    return row as T;
  }
  if (fieldMutMatch && method === "DELETE") {
    await deleteLocal("fields", fieldMutMatch[1]);
    await cascadeNullField("fieldId", fieldMutMatch[1]);
    notifyDataChanged();
    return { ok: true } as T;
  }

  // ---------- crops ----------
  if (p === "/api/crops" && method === "POST") {
    const row: CropRow = {
      id: newId(),
      crop: String(b.crop ?? "").trim() || "Maize",
      variety: (b.variety as string) ?? null,
      fieldId: (b.fieldId as string) ?? null,
      plantingDate: b.plantingDate ? new Date(b.plantingDate as string).toISOString() : null,
      expectedHarvestDate: b.expectedHarvestDate ? new Date(b.expectedHarvestDate as string).toISOString() : null,
      actualHarvestDate: b.actualHarvestDate ? new Date(b.actualHarvestDate as string).toISOString() : null,
      seedDetails: (b.seedDetails as string) ?? null,
      harvestQuantity: (b.harvestQuantity as number) ?? null,
      harvestUnit: (b.harvestUnit as string) ?? null,
      saleAmount: (b.saleAmount as number) ?? null,
      status: (b.status as string) ?? "planned",
      notes: (b.notes as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("crops", row);
    return { ...row, field: null } as T;
  }
  const cropMutMatch = p.match(/^\/api\/crops\/([^/]+)$/);
  if (cropMutMatch && method === "PUT") {
    const prev = await farmDb.crops.get(cropMutMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Crop cycle not found", 404);
    const row = { ...prev, ...b, id: prev.id, createdAt: prev.createdAt, updatedAt: now } as CropRow;
    await putLocal("crops", row);
    return { ...row, field: null } as T;
  }
  if (cropMutMatch && method === "DELETE") {
    await deleteLocal("crops", cropMutMatch[1]);
    await cascadeNullField("cropCycleId", cropMutMatch[1]);
    notifyDataChanged();
    return { ok: true } as T;
  }
  const harvestMatch = p.match(/^\/api\/crops\/([^/]+)\/harvest$/);
  if (harvestMatch && method === "POST") return harvestCrop(harvestMatch[1], b as never) as Promise<T>;

  // ---------- activities ----------
  if (p === "/api/activities" && method === "POST") {
    const row: ActivityRow = {
      id: newId(),
      type: (b.type as string) ?? "other",
      title: String(b.title ?? "").trim() || "Farm activity",
      date: b.date ? new Date(b.date as string).toISOString() : now,
      details: (b.details as string) ?? null,
      cost: (b.cost as number) ?? null,
      cropCycleId: (b.cropCycleId as string) ?? null,
      fieldId: (b.fieldId as string) ?? null,
      animalId: (b.animalId as string) ?? null,
      groupId: (b.groupId as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("activities", row);
    return { ...row, animal: null, group: null, field: null, cropCycle: null } as T;
  }
  const actMutMatch = p.match(/^\/api\/activities\/([^/]+)$/);
  if (actMutMatch && method === "PUT") {
    const prev = await farmDb.activities.get(actMutMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Activity not found", 404);
    const row = { ...prev, ...b, id: prev.id, createdAt: prev.createdAt, updatedAt: now } as ActivityRow;
    await putLocal("activities", row);
    return { ...row, animal: null, group: null, field: null, cropCycle: null } as T;
  }
  if (actMutMatch && method === "DELETE") {
    await deleteLocal("activities", actMutMatch[1]);
    return { ok: true } as T;
  }

  // ---------- finances ----------
  if (p === "/api/finance" && method === "POST") {
    const amount = Number(b.amount);
    if (!isFinite(amount) || amount <= 0) throw new OfflineError("Amount must be greater than 0", 400);
    const row: TransactionRow = {
      id: newId(),
      type: (b.type as string) === "income" ? "income" : "expense",
      category: String(b.category ?? "").trim() || "Other",
      amount,
      date: new Date(b.date as string).toISOString(),
      description: String(b.description ?? "").trim() || "Transaction",
      paymentMethod: (b.paymentMethod as string) ?? null,
      receipt: (b.receipt as string) ?? null,
      cropCycleId: (b.cropCycleId as string) ?? null,
      fieldId: (b.fieldId as string) ?? null,
      animalId: (b.animalId as string) ?? null,
      groupId: (b.groupId as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("transactions", row);
    return { ...row, animal: null, group: null, field: null, cropCycle: null } as T;
  }
  const finMutMatch = p.match(/^\/api\/finance\/([^/]+)$/);
  if (finMutMatch && method === "PUT") {
    const prev = await farmDb.transactions.get(finMutMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Transaction not found", 404);
    const row = { ...prev, ...b, id: prev.id, createdAt: prev.createdAt, updatedAt: now } as TransactionRow;
    await putLocal("transactions", row);
    return { ...row, animal: null, group: null, field: null, cropCycle: null } as T;
  }
  if (finMutMatch && method === "DELETE") {
    await deleteLocal("transactions", finMutMatch[1]);
    return { ok: true } as T;
  }

  // ---------- knowledge ----------
  if (p === "/api/knowledge" && method === "POST") {
    for (const key of ["title", "topic", "source", "summary", "content"] as const) {
      if (!String(b[key] ?? "").trim()) throw new OfflineError("All fields are required", 400);
    }
    const row: KnowledgeRow = {
      id: newId(),
      title: String(b.title).trim(),
      topic: String(b.topic).trim(),
      source: String(b.source).trim(),
      sourceUrl: (b.sourceUrl as string) ?? null,
      publishedDate: (b.publishedDate as string) ?? null,
      retrievedDate: now,
      summary: String(b.summary).trim(),
      content: String(b.content).trim(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("knowledge", row);
    return { ...row, userAdded: !CURATED_TITLES.has(row.title) } as T;
  }
  const knowMatch = p.match(/^\/api\/knowledge\/([^/]+)$/);
  if (knowMatch && method === "DELETE") {
    await deleteLocal("knowledge", knowMatch[1]);
    return { ok: true } as T;
  }

  // ---------- rainfall (upsert by calendar day) ----------
  if (p === "/api/rainfall" && method === "POST") {
    const mm = Number(b.mm);
    if (!isFinite(mm) || mm < 0) throw new OfflineError("Rainfall must be a number (mm)", 400);
    const date = new Date(b.date as string);
    if (Number.isNaN(date.getTime())) throw new OfflineError("A valid date is required", 400);
    const existing = (await farmDb.rainfall.toArray()).find(
      (r) => !r.deletedAt && sameDay(new Date(r.date), date)
    );
    if (existing) {
      const row = { ...existing, mm, note: (b.note as string) ?? null, updatedAt: now };
      await putLocal("rainfall", row);
      return { id: row.id, date: row.date, mm: row.mm, note: row.note } as T;
    }
    const row: RainfallRow = {
      id: newId(),
      date: date.toISOString(),
      mm,
      note: (b.note as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("rainfall", row);
    return { id: row.id, date: row.date, mm: row.mm, note: row.note } as T;
  }
  const rainMatch = p.match(/^\/api\/rainfall\/([^/]+)$/);
  if (rainMatch && method === "DELETE") {
    await deleteLocal("rainfall", rainMatch[1]);
    return { ok: true } as T;
  }

  // ---------- map ----------
  if (p === "/api/map" && method === "POST") {
    const row: MapItemRow = {
      id: newId(),
      kind: (b.kind as string) ?? "other",
      label: String(b.label ?? "").trim() || "Item",
      x: Number(b.x ?? 50),
      y: Number(b.y ?? 50),
      w: Number(b.w ?? 12),
      h: Number(b.h ?? 12),
      color: (b.color as string) ?? null,
      notes: (b.notes as string) ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await putLocal("mapItems", row);
    return row as T;
  }
  const mapMutMatch = p.match(/^\/api\/map\/([^/]+)$/);
  if (mapMutMatch && method === "PUT") {
    const prev = await farmDb.mapItems.get(mapMutMatch[1]);
    if (!prev || prev.deletedAt) throw new OfflineError("Map item not found", 404);
    const row = { ...prev, ...b, id: prev.id, createdAt: prev.createdAt, updatedAt: now } as MapItemRow;
    await putLocal("mapItems", row);
    return row as T;
  }
  if (mapMutMatch && method === "DELETE") {
    await deleteLocal("mapItems", mapMutMatch[1]);
    return { ok: true } as T;
  }

  // ---------- online-only endpoints (AI, push management) ----------
  const onlineOnly = p === "/api/ai" || p.startsWith("/api/push/") || p === "/api/reports/print";
  if (onlineOnly) {
    if (typeof navigator === "undefined" || !navigator.onLine) {
      throw new OfflineError(
        p === "/api/ai"
          ? "The AI assistant needs an internet connection. Everything else keeps working offline."
          : "This needs an internet connection.",
        0
      );
    }
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if (data?.error) message = String(data.error);
      } catch { /* ignore */ }
      throw new OfflineError(message, res.status);
    }
    return res.json() as Promise<T>;
  }

  // CSV export (GET-like but triggered via apiSend? No — CSV is fetched via apiGet below)
  throw new OfflineError(`Unsupported request: ${method} ${p}`, 404);
}

/** CSV export helper (used by the settings data card). */
export async function apiGetCsv(table: string): Promise<string> {
  return exportCsv(table);
}
