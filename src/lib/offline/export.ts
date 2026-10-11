/**
 * Farm Command — offline data export (Excel / Word / PDF).
 *
 * Everything here runs 100% in the browser from the local Dexie database, so
 * export works with NO internet. No external libraries are used — the files
 * are built from plain text/markup that the target apps open natively:
 *   • Excel  → SpreadsheetML 2003 XML (.xls)  — opens in Excel / LibreOffice /
 *            Google Sheets, supports multiple sheets + a styled header row.
 *   • Word   → Word-flavoured HTML (.doc)       — opens in Word / Google Docs,
 *            tables render as real tables.
 *   • PDF    → a clean print view + the browser's "Save as PDF" (works on
 *            Android Chrome and desktop).
 */

import { farmDb, alive } from "./db";
import {
  formatDate,
  formatKwacha,
  titleCase,
  groupRoleSummary,
  flockRoleSummary,
  computeTaskStatus,
  TASK_STATUS_LABEL,
} from "@/lib/farm";

export type ExportScope =
  | "all"
  | "livestock"
  | "poultry"
  | "crops"
  | "tasks"
  | "finances"
  | "health";

export type CellValue = string | number;

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportSheet {
  name: string; // worksheet / section name (kept <= 31 chars for Excel)
  columns: ExportColumn[];
  rows: Record<string, CellValue>[];
}

export const SCOPE_LABELS: Record<ExportScope, string> = {
  all: "Everything",
  livestock: "Livestock",
  poultry: "Poultry",
  crops: "Crops & fields",
  tasks: "Tasks & reminders",
  finances: "Finances",
  health: "Health & vaccinations",
};

const dash = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
};

// ---------- dataset collectors ----------

async function livestockSheets(): Promise<ExportSheet[]> {
  const [groups, animals] = await Promise.all([
    farmDb.groups.toArray(),
    farmDb.animals.toArray(),
  ]);
  const g = groups.filter(alive);
  const a = animals.filter(alive);
  return [
    {
      name: "Livestock groups",
      columns: [
        { key: "name", label: "Group" },
        { key: "species", label: "Species" },
        { key: "breed", label: "Breed" },
        { key: "count", label: "Head" },
        { key: "breakdown", label: "Breakdown" },
        { key: "location", label: "Location" },
        { key: "status", label: "Status" },
        { key: "notes", label: "Notes" },
      ],
      rows: g.map((row) => ({
        name: dash(row.name),
        species: dash(row.species),
        breed: dash(row.breed),
        count: row.count ?? 0,
        breakdown: groupRoleSummary(row) ?? "",
        location: dash(row.location),
        status: titleCase(dash(row.status)),
        notes: dash(row.notes),
      })),
    },
    {
      name: "Animals",
      columns: [
        { key: "tagId", label: "Tag" },
        { key: "name", label: "Name" },
        { key: "species", label: "Species" },
        { key: "breed", label: "Breed" },
        { key: "sex", label: "Sex" },
        { key: "weightKg", label: "Weight (kg)" },
        { key: "status", label: "Status" },
        { key: "location", label: "Location" },
      ],
      rows: a.map((row) => ({
        tagId: dash(row.tagId),
        name: dash(row.name),
        species: dash(row.species),
        breed: dash(row.breed),
        sex: dash(row.sex),
        weightKg: typeof row.weightKg === "number" ? row.weightKg : "",
        status: titleCase(dash(row.status)),
        location: dash(row.location),
      })),
    },
  ];
}

async function poultrySheets(): Promise<ExportSheet[]> {
  const [flocks, eggs] = await Promise.all([
    farmDb.poultryFlocks.toArray(),
    farmDb.eggLogs.toArray(),
  ]);
  const f = flocks.filter(alive);
  const e = eggs.filter(alive);
  const flockName = new Map(f.map((x) => [x.id, x.name]));
  return [
    {
      name: "Poultry flocks",
      columns: [
        { key: "name", label: "Flock" },
        { key: "birdType", label: "Bird type" },
        { key: "breed", label: "Breed" },
        { key: "count", label: "Birds" },
        { key: "breakdown", label: "Breakdown" },
        { key: "location", label: "Location" },
        { key: "status", label: "Status" },
      ],
      rows: f.map((row) => ({
        name: dash(row.name),
        birdType: dash(row.birdType),
        breed: dash(row.breed),
        count: row.count ?? 0,
        breakdown: flockRoleSummary(row) ?? "",
        location: dash(row.location),
        status: titleCase(dash(row.status)),
      })),
    },
    {
      name: "Egg collection",
      columns: [
        { key: "date", label: "Date" },
        { key: "flock", label: "Flock" },
        { key: "eggs", label: "Eggs" },
        { key: "notes", label: "Notes" },
      ],
      rows: e
        .slice()
        .sort((x, y) => (x.date < y.date ? 1 : -1))
        .map((row) => ({
          date: formatDate(row.date),
          flock: dash(flockName.get(row.flockId) ?? row.flockId),
          eggs: row.eggs ?? 0,
          notes: dash(row.notes),
        })),
    },
  ];
}

async function cropsSheets(): Promise<ExportSheet[]> {
  const [crops, fields] = await Promise.all([
    farmDb.crops.toArray(),
    farmDb.fields.toArray(),
  ]);
  const c = crops.filter(alive);
  const fl = fields.filter(alive);
  const fieldName = new Map(fl.map((x) => [x.id, x.name]));
  return [
    {
      name: "Crop cycles",
      columns: [
        { key: "crop", label: "Crop" },
        { key: "variety", label: "Variety" },
        { key: "field", label: "Field" },
        { key: "planting", label: "Planted" },
        { key: "harvest", label: "Harvest" },
        { key: "yield", label: "Yield" },
        { key: "status", label: "Status" },
      ],
      rows: c.map((row) => ({
        crop: dash(row.crop),
        variety: dash(row.variety),
        field: dash(row.fieldId ? fieldName.get(row.fieldId) ?? "" : ""),
        planting: formatDate(row.plantingDate),
        harvest: formatDate(row.actualHarvestDate ?? row.expectedHarvestDate),
        yield:
          typeof row.harvestQuantity === "number"
            ? `${row.harvestQuantity} ${dash(row.harvestUnit)}`.trim()
            : "",
        status: titleCase(dash(row.status)),
      })),
    },
    {
      name: "Fields",
      columns: [
        { key: "name", label: "Field" },
        { key: "areaHa", label: "Area (ha)" },
        { key: "location", label: "Location" },
        { key: "irrigation", label: "Irrigation" },
      ],
      rows: fl.map((row) => ({
        name: dash(row.name),
        areaHa: typeof row.areaHa === "number" ? row.areaHa : "",
        location: dash(row.location),
        irrigation: dash(row.irrigation),
      })),
    },
  ];
}

async function tasksSheets(): Promise<ExportSheet[]> {
  const tasks = (await farmDb.tasks.toArray()).filter(alive);
  return [
    {
      name: "Tasks & reminders",
      columns: [
        { key: "title", label: "Task" },
        { key: "category", label: "Category" },
        { key: "dueDate", label: "Due" },
        { key: "priority", label: "Priority" },
        { key: "status", label: "Status" },
        { key: "notes", label: "Notes" },
      ],
      rows: tasks
        .slice()
        .sort((x, y) => (x.dueDate < y.dueDate ? -1 : 1))
        .map((row) => ({
          title: dash(row.title),
          category: titleCase(dash(row.category)),
          dueDate: formatDate(row.dueDate),
          priority: titleCase(dash(row.priority)),
          status: TASK_STATUS_LABEL[computeTaskStatus(row)] ?? titleCase(dash(row.status)),
          notes: dash(row.notes ?? row.description),
        })),
    },
  ];
}

async function financesSheets(): Promise<ExportSheet[]> {
  const tx = (await farmDb.transactions.toArray()).filter(alive);
  return [
    {
      name: "Finances",
      columns: [
        { key: "date", label: "Date" },
        { key: "type", label: "Type" },
        { key: "category", label: "Category" },
        { key: "description", label: "Description" },
        { key: "amount", label: "Amount (ZMW)" },
      ],
      rows: tx
        .slice()
        .sort((x, y) => (x.date < y.date ? 1 : -1))
        .map((row) => ({
          date: formatDate(row.date),
          type: titleCase(dash(row.type)),
          category: dash(row.category),
          description: dash(row.description),
          amount: typeof row.amount === "number" ? row.amount : 0,
        })),
    },
  ];
}

async function healthSheets(): Promise<ExportSheet[]> {
  const [vaccinations, animals, groups] = await Promise.all([
    farmDb.vaccinations.toArray(),
    farmDb.animals.toArray(),
    farmDb.groups.toArray(),
  ]);
  const v = vaccinations.filter(alive);
  const subjectName = new Map<string, string>();
  animals.filter(alive).forEach((x) => subjectName.set(x.id, x.name || x.tagId));
  groups.filter(alive).forEach((x) => subjectName.set(x.id, x.name));
  return [
    {
      name: "Vaccinations",
      columns: [
        { key: "vaccineName", label: "Vaccine" },
        { key: "subject", label: "Animal / group" },
        { key: "dateGiven", label: "Given" },
        { key: "nextDueDate", label: "Next due" },
        { key: "administeredBy", label: "By" },
        { key: "notes", label: "Notes" },
      ],
      rows: v
        .slice()
        .sort((x, y) => (x.dateGiven < y.dateGiven ? 1 : -1))
        .map((row) => ({
          vaccineName: dash(row.vaccineName),
          subject: dash(
            (row.animalId && subjectName.get(row.animalId)) ||
              (row.groupId && subjectName.get(row.groupId)) ||
              ""
          ),
          dateGiven: formatDate(row.dateGiven),
          nextDueDate: formatDate(row.nextDueDate),
          administeredBy: dash(row.administeredBy),
          notes: dash(row.notes),
        })),
    },
  ];
}

/** Build the sheets for a scope ("all" = every section stacked together). */
export async function collectSheets(scope: ExportScope): Promise<ExportSheet[]> {
  switch (scope) {
    case "livestock":
      return livestockSheets();
    case "poultry":
      return poultrySheets();
    case "crops":
      return cropsSheets();
    case "tasks":
      return tasksSheets();
    case "finances":
      return financesSheets();
    case "health":
      return healthSheets();
    case "all":
    default: {
      const groups = await Promise.all([
        livestockSheets(),
        poultrySheets(),
        cropsSheets(),
        tasksSheets(),
        financesSheets(),
        healthSheets(),
      ]);
      return groups.flat();
    }
  }
}

/** Pretty currency string for finance amounts when rendered as text (Word/PDF). */
export function moneyText(v: CellValue): string {
  return typeof v === "number" ? formatKwacha(v) : String(v);
}

// serializers + download helpers are appended in export-file.ts via re-export
export { downloadExcel, downloadWord, exportPdf, triggerDownload } from "./export-file";
