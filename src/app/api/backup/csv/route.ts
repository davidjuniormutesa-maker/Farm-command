import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------- CSV helpers ----------

/** Escape a value for RFC-4180 CSV (quotes, commas, newlines). */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Dates export as the ISO date part (YYYY-MM-DD). */
function datePart(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function animalLabel(a: { tagId: string; name: string | null } | null | undefined): string {
  if (!a) return "";
  return a.name ? `${a.tagId} (${a.name})` : a.tagId;
}

interface CsvColumn<T> {
  header: string;
  get: (row: T) => string | number | null | undefined;
}

type CsvModel =
  | "animal"
  | "livestockGroup"
  | "task"
  | "financeTransaction"
  | "vaccination"
  | "farmActivity"
  | "field"
  | "cropCycle"
  | "healthEvent"
  | "weightRecord"
  | "rainfallLog";

interface CsvTable {
  model: CsvModel;
  columns: CsvColumn<Record<string, unknown>>[];
}

function col<T extends Record<string, unknown>>(
  header: string,
  get: (row: T) => string | number | null | undefined
): CsvColumn<Record<string, unknown>> {
  return { header, get: get as (row: Record<string, unknown>) => string | number | null | undefined };
}

function plain(key: string) {
  return col(key, (r) => (r[key] === null || r[key] === undefined ? "" : (r[key] as string | number)));
}

function dateCol(header: string, key: string) {
  return col(header, (r) => datePart(r[key] as string | null));
}

function relCol(header: string, key: string, pick: (v: Record<string, unknown>) => string) {
  return col(header, (r) => {
    const v = r[key];
    return v && typeof v === "object" ? pick(v as Record<string, unknown>) : "";
  });
}

const ANIMAL_REL = { select: { tagId: true, name: true } };
const GROUP_REL = { select: { name: true } };
const FIELD_REL = { select: { name: true } };
const CROP_REL = { select: { crop: true, variety: true } };

const INCLUDES: Record<string, Record<string, unknown> | undefined> = {
  animal: { group: GROUP_REL },
  task: { animal: ANIMAL_REL, group: GROUP_REL, cropCycle: CROP_REL, field: FIELD_REL },
  financeTransaction: { animal: ANIMAL_REL, group: GROUP_REL, cropCycle: CROP_REL, field: FIELD_REL },
  vaccination: { animal: ANIMAL_REL, group: GROUP_REL },
  farmActivity: { animal: ANIMAL_REL, group: GROUP_REL, cropCycle: CROP_REL, field: FIELD_REL },
  cropCycle: { field: FIELD_REL },
  healthEvent: { animal: ANIMAL_REL, group: GROUP_REL },
  weightRecord: { animal: ANIMAL_REL },
};

/** Newest-first for dated tables (registers read better top-down). */
const ORDER_BY: Record<string, Record<string, string>> = {
  financeTransaction: { date: "desc" },
  farmActivity: { date: "desc" },
  healthEvent: { date: "desc" },
  task: { dueDate: "asc" },
  vaccination: { dateGiven: "desc" },
  weightRecord: { recordedAt: "desc" },
  rainfallLog: { date: "desc" },
};

function buildTables(): Record<string, CsvTable> {
  return {
    animals: {
      model: "animal",
      columns: [
        plain("tagId"),
        plain("name"),
        plain("species"),
        plain("breed"),
        plain("sex"),
        dateCol("birthDate", "birthDate"),
        plain("estimatedAge"),
        plain("acquisition"),
        dateCol("acquisitionDate", "acquisitionDate"),
        plain("location"),
        plain("status"),
        plain("weightKg"),
        relCol("group", "group", (g) => String(g.name ?? "")),
        plain("notes"),
      ],
    },
    groups: {
      model: "livestockGroup",
      columns: [
        plain("name"),
        plain("species"),
        plain("breed"),
        plain("count"),
        plain("location"),
        plain("acquisition"),
        plain("status"),
        plain("notes"),
      ],
    },
    tasks: {
      model: "task",
      columns: [
        plain("title"),
        plain("description"),
        plain("category"),
        dateCol("dueDate", "dueDate"),
        plain("dueTime"),
        plain("priority"),
        plain("repeatRule"),
        plain("repeatIntervalDays"),
        plain("status"),
        dateCol("completedAt", "completedAt"),
        plain("assignee"),
        relCol("animal", "animal", (a) => animalLabel(a as { tagId: string; name: string | null })),
        relCol("group", "group", (g) => String(g.name ?? "")),
        relCol("cropCycle", "cropCycle", (c) => String(c.crop ?? "")),
        relCol("field", "field", (f) => String(f.name ?? "")),
      ],
    },
    transactions: {
      model: "financeTransaction",
      columns: [
        dateCol("date", "date"),
        plain("type"),
        plain("category"),
        plain("description"),
        plain("amount"),
        plain("paymentMethod"),
        relCol("animal", "animal", (a) => animalLabel(a as { tagId: string; name: string | null })),
        relCol("group", "group", (g) => String(g.name ?? "")),
        relCol("cropCycle", "cropCycle", (c) => String(c.crop ?? "")),
        relCol("field", "field", (f) => String(f.name ?? "")),
      ],
    },
    vaccinations: {
      model: "vaccination",
      columns: [
        plain("vaccineName"),
        dateCol("dateGiven", "dateGiven"),
        dateCol("nextDueDate", "nextDueDate"),
        plain("batchNumber"),
        plain("administeredBy"),
        relCol("animal", "animal", (a) => animalLabel(a as { tagId: string; name: string | null })),
        relCol("group", "group", (g) => String(g.name ?? "")),
        plain("notes"),
      ],
    },
    activities: {
      model: "farmActivity",
      columns: [
        dateCol("date", "date"),
        plain("type"),
        plain("title"),
        plain("details"),
        plain("cost"),
        relCol("animal", "animal", (a) => animalLabel(a as { tagId: string; name: string | null })),
        relCol("group", "group", (g) => String(g.name ?? "")),
        relCol("cropCycle", "cropCycle", (c) => String(c.crop ?? "")),
        relCol("field", "field", (f) => String(f.name ?? "")),
      ],
    },
    fields: {
      model: "field",
      columns: [
        plain("name"),
        plain("areaHa"),
        plain("location"),
        plain("soilNotes"),
        plain("irrigation"),
        plain("notes"),
      ],
    },
    crops: {
      model: "cropCycle",
      columns: [
        plain("crop"),
        plain("variety"),
        relCol("field", "field", (f) => String(f.name ?? "")),
        dateCol("plantingDate", "plantingDate"),
        dateCol("expectedHarvestDate", "expectedHarvestDate"),
        dateCol("actualHarvestDate", "actualHarvestDate"),
        plain("harvestQuantity"),
        plain("harvestUnit"),
        plain("saleAmount"),
        plain("status"),
        plain("notes"),
      ],
    },
    "health-events": {
      model: "healthEvent",
      columns: [
        dateCol("date", "date"),
        plain("type"),
        plain("title"),
        plain("details"),
        plain("medication"),
        plain("administeredBy"),
        plain("withdrawalDays"),
        relCol("animal", "animal", (a) => animalLabel(a as { tagId: string; name: string | null })),
        relCol("group", "group", (g) => String(g.name ?? "")),
      ],
    },
    weights: {
      model: "weightRecord",
      columns: [
        dateCol("recordedAt", "recordedAt"),
        plain("weightKg"),
        relCol("animal", "animal", (a) => animalLabel(a as { tagId: string; name: string | null })),
        plain("note"),
      ],
    },
    rainfall: {
      model: "rainfallLog",
      columns: [
        dateCol("date", "date"),
        plain("mm"),
        plain("note"),
      ],
    },
  };
}

async function fetchRows(table: CsvTable): Promise<Record<string, unknown>[]> {
  const include = INCLUDES[table.model];
  const orderBy = ORDER_BY[table.model] ?? { createdAt: "asc" };
  const args: { include?: Record<string, unknown>; orderBy: Record<string, string> } = { orderBy };
  if (include) args.include = include;
  switch (table.model) {
    case "animal":
      return db.animal.findMany(args);
    case "task":
      return db.task.findMany(args);
    case "financeTransaction":
      return db.financeTransaction.findMany(args);
    case "vaccination":
      return db.vaccination.findMany(args);
    case "farmActivity":
      return db.farmActivity.findMany(args);
    case "cropCycle":
      return db.cropCycle.findMany(args);
    case "healthEvent":
      return db.healthEvent.findMany(args);
    case "weightRecord":
      return db.weightRecord.findMany(args);
    default:
      return (db[table.model] as { findMany: (args: object) => Promise<Record<string, unknown>[]> }).findMany(args);
  }
}

/**
 * GET /api/backup/csv?table=animals — one table as a downloadable CSV file.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const table = searchParams.get("table") ?? "";

    const tables = buildTables();
    const config = tables[table];
    if (!config) {
      return NextResponse.json(
        { error: `Unknown table "${table}". Available: ${Object.keys(tables).join(", ")}` },
        { status: 400 }
      );
    }

    const rows = await fetchRows(config);

    const lines = [config.columns.map((c) => cell(c.header)).join(",")];
    for (const row of rows) {
      lines.push(config.columns.map((c) => cell(c.get(row))).join(","));
    }
    const csv = `\uFEFF${lines.join("\r\n")}\r\n`;

    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="farm-command-${table}-${today}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/backup/csv failed", error);
    return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}
