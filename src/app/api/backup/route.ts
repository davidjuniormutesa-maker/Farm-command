import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resetFarmData } from "@/lib/seed";

export const dynamic = "force-dynamic";

const MALFORMED_MESSAGE = "This file doesn't look like a Farm Command backup";

const row = z.record(z.string(), z.unknown());

const backupSchema = z.object({
  version: z.literal(1, { message: MALFORMED_MESSAGE }),
  exportedAt: z.string().optional(),
  data: z
    .object({
      farmSettings: z.array(row).optional(),
      groups: z.array(row).optional(),
      animals: z.array(row).optional(),
      weightRecords: z.array(row).optional(),
      healthEvents: z.array(row).optional(),
      vaccinations: z.array(row).optional(),
      fields: z.array(row).optional(),
      cropCycles: z.array(row).optional(),
      activities: z.array(row).optional(),
      tasks: z.array(row).optional(),
      transactions: z.array(row).optional(),
      knowledgeArticles: z.array(row).optional(),
      rainfallLogs: z.array(row).optional(),
      mapItems: z.array(row).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, { message: MALFORMED_MESSAGE }),
});

type BackupRow = Record<string, unknown>;

function serializeRows(rows: Record<string, unknown>[]): BackupRow[] {
  return rows.map((r) => {
    const out: BackupRow = {};
    for (const [k, v] of Object.entries(r)) out[k] = v instanceof Date ? v.toISOString() : v;
    return out;
  });
}

/** GET /api/backup — full JSON export of every farm table. */
export async function GET() {
  try {
    const [
      farmSettings,
      groups,
      animals,
      weightRecords,
      healthEvents,
      vaccinations,
      fields,
      cropCycles,
      activities,
      tasks,
      transactions,
      knowledgeArticles,
      rainfallLogs,
      mapItems,
    ] = await Promise.all([
      db.farmSetting.findMany(),
      db.livestockGroup.findMany(),
      db.animal.findMany(),
      db.weightRecord.findMany(),
      db.healthEvent.findMany(),
      db.vaccination.findMany(),
      db.field.findMany(),
      db.cropCycle.findMany(),
      db.farmActivity.findMany(),
      db.task.findMany(),
      db.financeTransaction.findMany(),
      db.knowledgeArticle.findMany(),
      db.rainfallLog.findMany(),
      db.farmMapItem.findMany(),
    ]);

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      version: 1,
      data: {
        farmSettings: serializeRows(farmSettings),
        groups: serializeRows(groups),
        animals: serializeRows(animals),
        weightRecords: serializeRows(weightRecords),
        healthEvents: serializeRows(healthEvents),
        vaccinations: serializeRows(vaccinations),
        fields: serializeRows(fields),
        cropCycles: serializeRows(cropCycles),
        activities: serializeRows(activities),
        tasks: serializeRows(tasks),
        transactions: serializeRows(transactions),
        knowledgeArticles: serializeRows(knowledgeArticles),
        rainfallLogs: serializeRows(rainfallLogs),
        mapItems: serializeRows(mapItems),
      },
    });
  } catch (error) {
    console.error("GET /api/backup failed", error);
    return NextResponse.json({ error: "Failed to create backup" }, { status: 500 });
  }
}

// ---------- Restore helpers ----------

function newId(r: BackupRow): string {
  const id = r.id;
  return typeof id === "string" && id.trim() ? id.trim() : crypto.randomUUID();
}

function str(r: BackupRow, key: string): string | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function reqStr(r: BackupRow, key: string, fallback: string): string {
  return str(r, key) ?? fallback;
}

function num(r: BackupRow, key: string): number | null {
  const v = r[key];
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function to_date(r: BackupRow, key: string): Date | null {
  const v = r[key];
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function reqDate(r: BackupRow, key: string): Date {
  return to_date(r, key) ?? new Date();
}

/** Remap a foreign key through an id map; dangling references become null. */
function rel(map: Map<string, string>, r: BackupRow, key: string): string | null {
  const raw = str(r, key);
  if (!raw) return null;
  return map.get(raw) ?? null;
}

/**
 * POST /api/backup — restore a Farm Command JSON backup.
 * Strategy: wipe & replace (settings preserved), ids are preserved when present,
 * missing ids get fresh ones, and dangling links are dropped (set to null) so
 * the restore never fails on FK constraints.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = backupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: MALFORMED_MESSAGE }, { status: 400 });
    }
    const data = parsed.data.data;
    const arr = (key: keyof typeof data): BackupRow[] => (data[key] as BackupRow[] | undefined) ?? [];

    await resetFarmData(false);

    const counts = await db.$transaction(async (tx) => {
      // 1. Groups
      const groupMap = new Map<string, string>();
      for (const r of arr("groups")) {
        const id = newId(r);
        await tx.livestockGroup.create({
          data: {
            id,
            name: reqStr(r, "name", "Unnamed group"),
            species: reqStr(r, "species", "Other"),
            breed: str(r, "breed"),
            count: num(r, "count") ?? 0,
            location: str(r, "location"),
            acquisition: str(r, "acquisition"),
            status: reqStr(r, "status", "active"),
            notes: str(r, "notes"),
            photo: str(r, "photo"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        groupMap.set(String(r.id ?? id), id);
      }

      // 2. Animals
      const animalMap = new Map<string, string>();
      for (const r of arr("animals")) {
        const id = newId(r);
        await tx.animal.create({
          data: {
            id,
            tagId: reqStr(r, "tagId", `IMP-${id.slice(0, 6).toUpperCase()}`),
            name: str(r, "name"),
            species: reqStr(r, "species", "Other"),
            breed: str(r, "breed"),
            sex: str(r, "sex"),
            birthDate: to_date(r, "birthDate"),
            estimatedAge: str(r, "estimatedAge"),
            acquisition: str(r, "acquisition"),
            acquisitionDate: to_date(r, "acquisitionDate"),
            location: str(r, "location"),
            status: reqStr(r, "status", "active"),
            weightKg: num(r, "weightKg"),
            targetWeightKg: num(r, "targetWeightKg"),
            notes: str(r, "notes"),
            photo: str(r, "photo"),
            groupId: rel(groupMap, r, "groupId"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        animalMap.set(String(r.id ?? id), id);
      }

      // 3. Fields
      const fieldMap = new Map<string, string>();
      for (const r of arr("fields")) {
        const id = newId(r);
        await tx.field.create({
          data: {
            id,
            name: reqStr(r, "name", "Unnamed field"),
            areaHa: num(r, "areaHa"),
            location: str(r, "location"),
            soilNotes: str(r, "soilNotes"),
            irrigation: str(r, "irrigation"),
            notes: str(r, "notes"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        fieldMap.set(String(r.id ?? id), id);
      }

      // 4. Crop cycles
      const cropCycleMap = new Map<string, string>();
      for (const r of arr("cropCycles")) {
        const id = newId(r);
        await tx.cropCycle.create({
          data: {
            id,
            crop: reqStr(r, "crop", "Other"),
            variety: str(r, "variety"),
            fieldId: rel(fieldMap, r, "fieldId"),
            plantingDate: to_date(r, "plantingDate"),
            expectedHarvestDate: to_date(r, "expectedHarvestDate"),
            actualHarvestDate: to_date(r, "actualHarvestDate"),
            seedDetails: str(r, "seedDetails"),
            harvestQuantity: num(r, "harvestQuantity"),
            harvestUnit: str(r, "harvestUnit"),
            saleAmount: num(r, "saleAmount"),
            status: reqStr(r, "status", "planned"),
            notes: str(r, "notes"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        cropCycleMap.set(String(r.id ?? id), id);
      }

      // 5. Weight records (animal required — skip rows with unknown animal)
      let weightCount = 0;
      for (const r of arr("weightRecords")) {
        const animalId = rel(animalMap, r, "animalId");
        if (!animalId) continue;
        await tx.weightRecord.create({
          data: {
            id: newId(r),
            animalId,
            weightKg: num(r, "weightKg") ?? 0,
            recordedAt: reqDate(r, "recordedAt"),
            note: str(r, "note"),
          },
        });
        weightCount++;
      }

      // 6. Health events
      let healthCount = 0;
      for (const r of arr("healthEvents")) {
        await tx.healthEvent.create({
          data: {
            id: newId(r),
            animalId: rel(animalMap, r, "animalId"),
            groupId: rel(groupMap, r, "groupId"),
            type: reqStr(r, "type", "note"),
            title: reqStr(r, "title", "Health event"),
            date: reqDate(r, "date"),
            details: str(r, "details"),
            administeredBy: str(r, "administeredBy"),
            medication: str(r, "medication"),
            withdrawalDays: num(r, "withdrawalDays"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        healthCount++;
      }

      // 7. Vaccinations (reminderTaskId restored as-is — plain string, no FK)
      let vaccinationCount = 0;
      for (const r of arr("vaccinations")) {
        await tx.vaccination.create({
          data: {
            id: newId(r),
            animalId: rel(animalMap, r, "animalId"),
            groupId: rel(groupMap, r, "groupId"),
            vaccineName: reqStr(r, "vaccineName", "Vaccination"),
            dateGiven: reqDate(r, "dateGiven"),
            nextDueDate: to_date(r, "nextDueDate"),
            batchNumber: str(r, "batchNumber"),
            administeredBy: str(r, "administeredBy"),
            notes: str(r, "notes"),
            attachment: str(r, "attachment"),
            reminderTaskId: str(r, "reminderTaskId"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        vaccinationCount++;
      }

      // 8. Activities
      let activityCount = 0;
      for (const r of arr("activities")) {
        await tx.farmActivity.create({
          data: {
            id: newId(r),
            type: reqStr(r, "type", "other"),
            title: reqStr(r, "title", "Activity"),
            date: reqDate(r, "date"),
            details: str(r, "details"),
            cost: num(r, "cost"),
            cropCycleId: rel(cropCycleMap, r, "cropCycleId"),
            fieldId: rel(fieldMap, r, "fieldId"),
            animalId: rel(animalMap, r, "animalId"),
            groupId: rel(groupMap, r, "groupId"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        activityCount++;
      }

      // 9. Tasks (vaccinationId / nextOccurrenceId are plain strings — kept as-is)
      let taskCount = 0;
      for (const r of arr("tasks")) {
        await tx.task.create({
          data: {
            id: newId(r),
            title: reqStr(r, "title", "Untitled task"),
            description: str(r, "description"),
            category: reqStr(r, "category", "general"),
            dueDate: reqDate(r, "dueDate"),
            dueTime: str(r, "dueTime"),
            priority: reqStr(r, "priority", "medium"),
            repeatRule: reqStr(r, "repeatRule", "once"),
            repeatIntervalDays: num(r, "repeatIntervalDays"),
            leadTimeDays: num(r, "leadTimeDays") ?? 0,
            animalId: rel(animalMap, r, "animalId"),
            groupId: rel(groupMap, r, "groupId"),
            cropCycleId: rel(cropCycleMap, r, "cropCycleId"),
            fieldId: rel(fieldMap, r, "fieldId"),
            assignee: str(r, "assignee"),
            status: reqStr(r, "status", "open"),
            completedAt: to_date(r, "completedAt"),
            nextOccurrenceId: str(r, "nextOccurrenceId"),
            vaccinationId: str(r, "vaccinationId"),
            notes: str(r, "notes"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        taskCount++;
      }

      // 10. Finance transactions
      let transactionCount = 0;
      for (const r of arr("transactions")) {
        await tx.financeTransaction.create({
          data: {
            id: newId(r),
            type: reqStr(r, "type", "expense") === "income" ? "income" : "expense",
            category: reqStr(r, "category", "Other"),
            amount: num(r, "amount") ?? 0,
            date: reqDate(r, "date"),
            description: reqStr(r, "description", "Transaction"),
            paymentMethod: str(r, "paymentMethod"),
            receipt: str(r, "receipt"),
            cropCycleId: rel(cropCycleMap, r, "cropCycleId"),
            fieldId: rel(fieldMap, r, "fieldId"),
            animalId: rel(animalMap, r, "animalId"),
            groupId: rel(groupMap, r, "groupId"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        transactionCount++;
      }

      // 11. Knowledge articles
      let knowledgeCount = 0;
      for (const r of arr("knowledgeArticles")) {
        await tx.knowledgeArticle.create({
          data: {
            id: newId(r),
            title: reqStr(r, "title", "Untitled article"),
            topic: reqStr(r, "topic", "general"),
            source: reqStr(r, "source", "Unknown source"),
            sourceUrl: str(r, "sourceUrl"),
            publishedDate: str(r, "publishedDate"),
            retrievedDate: reqDate(r, "retrievedDate"),
            summary: reqStr(r, "summary", ""),
            content: reqStr(r, "content", ""),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        knowledgeCount++;
      }

      // 12. Farm settings (upsert by key — settings are preserved by the wipe)
      let settingsCount = 0;
      for (const r of arr("farmSettings")) {
        const key = str(r, "key");
        const value = str(r, "value");
        if (!key || value === null) continue;
        await tx.farmSetting.upsert({
          where: { key },
          update: { value },
          create: { id: newId(r), key, value },
        });
        settingsCount++;
      }

      // 13. Rainfall logs (one record per day — upsert to survive duplicate dates)
      let rainfallCount = 0;
      for (const r of arr("rainfallLogs")) {
        const day = to_date(r, "date");
        if (!day) continue;
        day.setHours(12, 0, 0, 0);
        await tx.rainfallLog.upsert({
          where: { date: day },
          update: { mm: num(r, "mm") ?? 0, note: str(r, "note") },
          create: { id: newId(r), date: day, mm: num(r, "mm") ?? 0, note: str(r, "note") },
        });
        rainfallCount++;
      }

      // 14. Farm map layout blocks
      let mapItemCount = 0;
      for (const r of arr("mapItems")) {
        await tx.farmMapItem.create({
          data: {
            id: newId(r),
            kind: reqStr(r, "kind", "other"),
            label: reqStr(r, "label", "Block"),
            x: num(r, "x") ?? 0,
            y: num(r, "y") ?? 0,
            w: num(r, "w") ?? 10,
            h: num(r, "h") ?? 10,
            color: str(r, "color"),
            notes: str(r, "notes"),
            createdAt: to_date(r, "createdAt") ?? new Date(),
          },
        });
        mapItemCount++;
      }

      return {
        groups: groupMap.size,
        animals: animalMap.size,
        fields: fieldMap.size,
        cropCycles: cropCycleMap.size,
        weightRecords: weightCount,
        healthEvents: healthCount,
        vaccinations: vaccinationCount,
        activities: activityCount,
        tasks: taskCount,
        transactions: transactionCount,
        knowledgeArticles: knowledgeCount,
        farmSettings: settingsCount,
        rainfallLogs: rainfallCount,
        mapItems: mapItemCount,
      };
    });

    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    console.error("POST /api/backup failed", error);
    return NextResponse.json(
      { error: "Restore failed — the backup could not be applied. Try exporting the file again from the device that made it." },
      { status: 500 }
    );
  }
}
