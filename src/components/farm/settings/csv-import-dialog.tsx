"use client";

/**
 * CsvImportDialog — CSV import for Animals, Transactions, Vaccinations,
 * Weight records and Tasks (r8-a; vaccinations + weights r9, tasks r10).
 *
 * Round-trip compatible with Settings → Data → "Export a table as CSV"
 * (the export headers are also the import headers). Honesty rules:
 * - Empty files, unrecognised headers and zero valid rows are loud errors
 *   that list the expected headers — never a fake success.
 * - Every skipped row shows its reason before anything is imported.
 * - Import writes rows SEQUENTIALLY through the offline-first facade
 *   (apiSend → IndexedDB + outbox) so it works with no network; rows sync
 *   to the user's own server later. No IDs are ever fabricated: an animal
 *   tag that does not match an existing animal is a skipped row, never an
 *   invented link.
 * - Vaccination imports automatically get their next-due reminder tasks —
 *   the facade creates them, exactly like the manual form.
 */

import { useRef, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiSend, qk } from "@/lib/api";
import { titleCase, type AnimalDTO } from "@/lib/farm";
import { downloadFile, todayFileStamp } from "./settings-shared";

// ---------------------------------------------------------------------------
// Templates — EXACT export headers so files round-trip both ways.
// ---------------------------------------------------------------------------

type Target = "animals" | "transactions" | "vaccinations" | "weights" | "tasks";

const ANIMAL_HEADERS = [
  "Tag ID",
  "Name",
  "Species",
  "Breed",
  "Sex",
  "Birth date",
  "Status",
  "Weight (kg)",
  "Target weight (kg)",
  "Group",
  "Location",
  "Acquisition",
  "Notes",
] as const;

const TX_HEADERS = [
  "Type",
  "Category",
  "Amount (ZMW)",
  "Date",
  "Description",
  "Payment method",
] as const;

const ANIMAL_TEMPLATE_ROWS = [
  [
    "ZM-001",
    "Bella",
    "Cattle",
    "Angoni",
    "Female",
    "12/03/2022",
    "active",
    "320",
    "450",
    "Dairy herd",
    "Kraal A",
    "Purchased",
    "Vaccinated Mar 2026, dewormed",
  ],
  ["ZM-002", "Thandiwe", "Goat", "", "Female", "05/07/2023", "active", "45", "", "Breeding does", "Kraal B", "Born on farm", ""],
];

const TX_TEMPLATE_ROWS = [
  ["expense", "Feed", "1250.5", "01/09/2026", "10 x 50kg maize bran bags", "Cash"],
  ["income", "Crop sales", "8400", "15/09/2026", "Sold 40 bags of maize, grade A", "Mobile money"],
];

/** Matches the vaccinations export table exactly (round-trip). */
const VACC_HEADERS = [
  "Animal",
  "Group",
  "Vaccine",
  "Date given",
  "Next due",
  "Batch",
  "Administered by",
  "Notes",
] as const;

/** Matches the weight-records export table exactly (round-trip). */
const WEIGHT_HEADERS = ["Animal", "Weight (kg)", "Recorded at", "Note"] as const;

const VACC_TEMPLATE_ROWS = [
  ["C-023 (Mama)", "", "FMD vaccine", "01/09/2026", "01/03/2027", "BT-2214", "Dr. Banda", "Booster due Mar 2027"],
  ["", "Main cattle herd", "Dewormer", "05/09/2026", "05/12/2026", "", "", "Quarterly deworming"],
];

const WEIGHT_TEMPLATE_ROWS = [
  ["C-023 (Mama)", "321.4", "01/09/2026", "Monthly weigh-in"],
  ["G-014 (Chips)", "48.2", "", ""],
];

/** Matches the tasks export table exactly (round-trip). */
const TASK_HEADERS = [
  "Title",
  "Category",
  "Due date",
  "Due time",
  "Priority",
  "Repeat",
  "Status",
  "Assignee",
  "Animal",
  "Group",
  "Field",
  "Notes",
] as const;

const TASK_TEMPLATE_ROWS = [
  ["Dip cattle", "livestock", "25/09/2026", "08:00", "high", "monthly", "open", "", "", "Main cattle herd", "", "Use acaricide from store"],
  ["Order seed bags", "crop", "01/10/2026", "", "medium", "once", "open", "Dad", "", "", "Big Field", "Maize + soya"],
];

// ---------------------------------------------------------------------------
// Header mapping — normalised headers → canonical fields, with aliases.
// ---------------------------------------------------------------------------

const ANIMAL_ALIASES: Record<string, string[]> = {
  tagId: ["tag id", "tag", "tagid", "tag number", "ear tag"],
  name: ["name", "animal name"],
  species: ["species"],
  breed: ["breed"],
  sex: ["sex", "gender"],
  birthDate: ["birth date", "birthdate", "date of birth", "dob"],
  status: ["status"],
  weightKg: ["weight (kg)", "weight kg", "weight"],
  targetWeightKg: ["target weight (kg)", "target weight kg", "target weight", "target"],
  group: ["group", "herd", "livestock group", "group name"],
  location: ["location"],
  acquisition: ["acquisition", "acquired", "source"],
  notes: ["notes", "note", "comments", "remarks"],
};

const TX_ALIASES: Record<string, string[]> = {
  type: ["type", "transaction type"],
  category: ["category"],
  amount: ["amount (zmw)", "amount zmw", "amount"],
  date: ["date", "transaction date"],
  description: ["description", "details", "narration"],
  paymentMethod: ["payment method", "payment", "paid via", "method"],
};

const VACC_ALIASES: Record<string, string[]> = {
  animal: ["animal", "animal tag", "tag id", "tag", "animal tag id"],
  group: ["group", "herd"],
  vaccineName: ["vaccine", "vaccine name", "vaccination"],
  dateGiven: ["date given", "date", "date administered", "given on"],
  nextDueDate: ["next due", "next due date", "due date", "booster date"],
  batchNumber: ["batch", "batch number", "batch no"],
  administeredBy: ["administered by", "administered", "vet"],
  notes: ["notes", "note", "comments", "remarks"],
};

const WEIGHT_ALIASES: Record<string, string[]> = {
  animal: ["animal", "animal tag", "tag id", "tag"],
  weightKg: ["weight (kg)", "weight kg", "weight"],
  recordedAt: ["recorded at", "date", "date recorded", "weighed on", "date weighed"],
  note: ["note", "notes", "comment"],
};

const TASK_ALIASES: Record<string, string[]> = {
  title: ["title", "task", "task title"],
  category: ["category"],
  dueDate: ["due date", "date", "due"],
  dueTime: ["due time", "time"],
  priority: ["priority"],
  repeat: ["repeat", "repeat rule", "repeats"],
  status: ["status"],
  assignee: ["assignee", "assigned to", "who"],
  animal: ["animal", "animal tag", "tag id", "tag"],
  group: ["group", "herd"],
  field: ["field", "garden", "plot"],
  notes: ["notes", "note", "details", "comments"],
};

const TARGET_ALIASES: Record<Target, Record<string, string[]>> = {
  animals: ANIMAL_ALIASES,
  transactions: TX_ALIASES,
  vaccinations: VACC_ALIASES,
  weights: WEIGHT_ALIASES,
  tasks: TASK_ALIASES,
};

const TARGET_HEADERS: Record<Target, readonly string[]> = {
  animals: ANIMAL_HEADERS,
  transactions: TX_HEADERS,
  vaccinations: VACC_HEADERS,
  weights: WEIGHT_HEADERS,
  tasks: TASK_HEADERS,
};

const TARGET_LABEL: Record<Target, string> = {
  animals: "Animals",
  transactions: "Transactions",
  vaccinations: "Vaccinations",
  weights: "Weight records",
  tasks: "Tasks",
};

function normalizeHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase();
}

/** CSV column index → canonical field (or null when the column is ignored). */
function mapHeaders(headers: string[], aliases: Record<string, string[]>): (string | null)[] {
  const used = new Set<string>();
  return headers.map((raw) => {
    const norm = normalizeHeader(raw);
    for (const [field, names] of Object.entries(aliases)) {
      if (names.includes(norm) && !used.has(field)) {
        used.add(field);
        return field;
      }
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// Hand-rolled CSV parser — BOM, quoted fields, "" escapes, commas/newlines
// inside quotes, \r\n and \n. No dependencies.
// ---------------------------------------------------------------------------

interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

function parseCsv(text: string): ParsedCsv {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  // Drop lines that are completely empty (no data at all).
  const dataRows = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  return { headers, rows: dataRows };
}

// ---------------------------------------------------------------------------
// Date parsing — strict manual validation, never just Date.parse.
// Accepts YYYY-MM-DD, DD/MM/YYYY and any format Date.parse understands,
// but always rejects nonsense like 32/13/2026.
// ---------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "" = empty input (not an error), null = invalid, otherwise ISO YYYY-MM-DD. */
function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const dt = new Date(t);
  if (dt.getFullYear() < 1900 || dt.getFullYear() > 2100) return null;
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

// ---------------------------------------------------------------------------
// Import model
// ---------------------------------------------------------------------------

interface AnimalWithGroup extends AnimalDTO {
  group?: { id: string; name: string } | null;
}

interface PreviewRow {
  /** 1-based line in the user's file (header is line 1). */
  line: number;
  ok: boolean;
  /** Skip reason — always set when ok === false. */
  reason: string | null;
  /** Short identifying text shown for skipped rows (e.g. the Tag ID). */
  label: string;
  /** Display cells for the preview table. */
  cells: string[];
  payload: Record<string, unknown> | null;
}

interface ParseOutcome {
  columns: string[];
  mapping: (string | null)[];
  rows: PreviewRow[];
}

const PREVIEW_LIMIT = 100;

/** Preview table headers per target (Result column is appended). */
const PREVIEW_COLUMNS: Record<Target, string[]> = {
  animals: ["Line", "Tag ID", "Name", "Species", "Group"],
  transactions: ["Line", "Date", "Description", "Amount (ZMW)", "Type"],
  vaccinations: ["Line", "Animal / Group", "Vaccine", "Date given", "Next due"],
  weights: ["Line", "Animal", "Weight (kg)", "Recorded at"],
  tasks: ["Line", "Title", "Due", "Priority", "Linked to"],
};

function csvCellOut(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildTemplateCsv(target: Target): string {
  const rowsByTarget: Record<Target, string[][]> = {
    animals: ANIMAL_TEMPLATE_ROWS as unknown as string[][],
    transactions: TX_TEMPLATE_ROWS,
    vaccinations: VACC_TEMPLATE_ROWS,
    weights: WEIGHT_TEMPLATE_ROWS,
    tasks: TASK_TEMPLATE_ROWS,
  };
  const headers = TARGET_HEADERS[target];
  const rows = rowsByTarget[target];
  return [headers.map(csvCellOut).join(","), ...rows.map((r) => r.map(csvCellOut).join(","))].join("\r\n");
}

/** Validate + build one animal row. Returns { ok, reason?, row? }. */
function buildAnimalRow(
  rec: Record<string, string>,
  line: number,
  existingTags: Set<string>,
  seenTags: Set<string>,
  groupByName: Map<string, { id: string; name: string } | null>
): { ok: boolean; reason?: string; row?: PreviewRow } {
  const tagId = (rec.tagId ?? "").trim();
  if (!tagId) return { ok: false, reason: "Tag ID is required" };
  const tagKey = tagId.toLowerCase();
  if (existingTags.has(tagKey) || seenTags.has(tagKey)) {
    return { ok: false, reason: "Tag ID already exists" };
  }
  const birthRaw = rec.birthDate ?? "";
  let birthDate: string | null = null;
  if (birthRaw.trim()) {
    const parsed = parseFlexibleDate(birthRaw);
    if (parsed === null) return { ok: false, reason: "Birth date is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)" };
    birthDate = parsed;
  }
  const weightRaw = (rec.weightKg ?? "").trim();
  let weightKg: number | null = null;
  if (weightRaw) {
    const n = Number(weightRaw);
    if (!Number.isFinite(n) || n < 0) return { ok: false, reason: "Weight (kg) must be a number of 0 or more" };
    weightKg = n;
  }
  const targetRaw = (rec.targetWeightKg ?? "").trim();
  let targetWeightKg: number | null = null;
  if (targetRaw) {
    const n = Number(targetRaw);
    if (!Number.isFinite(n) || n < 0) return { ok: false, reason: "Target weight (kg) must be a number of 0 or more" };
    targetWeightKg = n;
  }

  const groupName = (rec.group ?? "").trim();
  const matched = groupName ? groupByName.get(groupName.toLowerCase()) ?? null : null;
  const groupCell = groupName ? (matched ? groupName : `${groupName} (not linked)`) : "";

  return {
    ok: true,
    row: {
      line,
      ok: true,
      reason: null,
      label: "",
      cells: [String(line), tagId, (rec.name ?? "").trim() || "—", (rec.species ?? "").trim() || "Cattle", groupCell || "—"],
      payload: {
        tagId,
        name: (rec.name ?? "").trim() || null,
        species: (rec.species ?? "").trim() || "Cattle",
        breed: (rec.breed ?? "").trim() || null,
        sex: (rec.sex ?? "").trim() || null,
        birthDate,
        status: (rec.status ?? "").trim() || "active",
        weightKg,
        targetWeightKg,
        // Only an exact (case-insensitive) name match links a group —
        // never fabricate an ID.
        groupId: matched ? matched.id : undefined,
      },
    },
  };
}

/** Validate + build one transaction row. */
function buildTxRow(rec: Record<string, string>, line: number): { ok: boolean; reason?: string; row?: PreviewRow } {
  const amountRaw = (rec.amount ?? "").trim();
  const amount = Number(amountRaw);
  if (!amountRaw || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "Amount must be greater than 0" };
  }
  const typeRaw = (rec.type ?? "").trim().toLowerCase();
  if (typeRaw && typeRaw !== "income" && typeRaw !== "expense") {
    return { ok: false, reason: 'Type must be "income" or "expense"' };
  }
  const type = typeRaw === "income" ? "income" : "expense";
  const dateRaw = rec.date ?? "";
  if (!dateRaw.trim()) return { ok: false, reason: "Date is required" };
  const iso = parseFlexibleDate(dateRaw);
  if (iso === null) return { ok: false, reason: "Date is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)" };

  const description = (rec.description ?? "").trim() || "Transaction";
  const category = (rec.category ?? "").trim() || "Other";

  return {
    ok: true,
    row: {
      line,
      ok: true,
      reason: null,
      label: "",
      cells: [String(line), iso, description, amount.toFixed(2), type === "income" ? "Income" : "Expense"],
      payload: {
        type,
        category,
        amount,
        date: iso,
        description,
        paymentMethod: (rec.paymentMethod ?? "").trim() || null,
      },
    },
  };
}

/**
 * Export-format animal cell → bare tag. The CSV export writes
 * "C-023 (Mama)"; the import accepts that or a bare "C-023".
 */
function parseAnimalTag(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const paren = s.indexOf("(");
  return (paren > 0 ? s.slice(0, paren) : s).trim();
}

/** Validate + build one vaccination row (r9). */
function buildVaccinationRow(
  rec: Record<string, string>,
  line: number,
  animalByTag: Map<string, AnimalWithGroup>,
  groupByName: Map<string, { id: string; name: string }>,
  seenKeys: Set<string>
): { ok: boolean; reason?: string; row?: PreviewRow } {
  const vaccineName = (rec.vaccineName ?? "").trim();
  if (!vaccineName) return { ok: false, reason: "Vaccine is required" };

  const dateRaw = rec.dateGiven ?? "";
  if (!dateRaw.trim()) return { ok: false, reason: "Date given is required" };
  const dateGiven = parseFlexibleDate(dateRaw);
  if (dateGiven === null) {
    return { ok: false, reason: "Date given is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)" };
  }

  let nextDueDate: string | null = null;
  const nextRaw = (rec.nextDueDate ?? "").trim();
  if (nextRaw) {
    const parsed = parseFlexibleDate(nextRaw);
    if (parsed === null) {
      return { ok: false, reason: "Next due is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)" };
    }
    nextDueDate = parsed;
  }

  // Resolve the target: an animal tag wins; otherwise a group name.
  const tag = parseAnimalTag(rec.animal ?? "");
  const groupNameRaw = (rec.group ?? "").trim();
  if (!tag && !groupNameRaw) {
    return { ok: false, reason: "Needs an Animal tag or a Group (one is required)" };
  }

  let animalId: string | undefined;
  let animalDisplay = "";
  if (tag) {
    const animal = animalByTag.get(tag.toLowerCase());
    if (!animal) return { ok: false, reason: `Animal tag “${tag}” not found in your records` };
    animalId = animal.id;
    animalDisplay = animal.name ? `${animal.tagId} (${animal.name})` : animal.tagId;
  }

  let groupId: string | undefined;
  let groupDisplay = "";
  if (!animalId && groupNameRaw) {
    const group = groupByName.get(groupNameRaw.toLowerCase());
    if (!group) return { ok: false, reason: `Group “${groupNameRaw}” not found in your records` };
    groupId = group.id;
    groupDisplay = group.name;
  }

  // In-file duplicate: same animal/group + vaccine + date given.
  const dupKey = `${animalId ?? groupId ?? ""}|${vaccineName.toLowerCase()}|${dateGiven}`;
  if (seenKeys.has(dupKey)) return { ok: false, reason: "Duplicate row in file" };
  seenKeys.add(dupKey);

  return {
    ok: true,
    row: {
      line,
      ok: true,
      reason: null,
      label: "",
      cells: [
        String(line),
        animalDisplay || groupDisplay,
        vaccineName,
        dateGiven,
        nextDueDate ?? "—",
      ],
      payload: {
        animalId,
        groupId,
        vaccineName,
        dateGiven,
        nextDueDate,
        batchNumber: (rec.batchNumber ?? "").trim() || null,
        administeredBy: (rec.administeredBy ?? "").trim() || null,
        notes: (rec.notes ?? "").trim() || null,
      },
    },
  };
}

/** Validate + build one weight-record row (r9). */
function buildWeightRow(
  rec: Record<string, string>,
  line: number,
  animalByTag: Map<string, AnimalWithGroup>,
  seenKeys: Set<string>
): { ok: boolean; reason?: string; row?: PreviewRow } {
  const tag = parseAnimalTag(rec.animal ?? "");
  if (!tag) return { ok: false, reason: "Animal is required" };
  const animal = animalByTag.get(tag.toLowerCase());
  if (!animal) return { ok: false, reason: `Animal tag “${tag}” not found in your records` };

  const weightRaw = (rec.weightKg ?? "").trim();
  const weight = Number(weightRaw);
  if (!weightRaw || !Number.isFinite(weight) || weight <= 0) {
    return { ok: false, reason: "Weight (kg) must be a number greater than 0" };
  }

  const dateRaw = (rec.recordedAt ?? "").trim();
  let recordedAt: string;
  let dateCell: string;
  if (dateRaw) {
    const parsed = parseFlexibleDate(dateRaw);
    if (parsed === null) {
      return { ok: false, reason: "Recorded at is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)" };
    }
    recordedAt = parsed;
    dateCell = parsed;
  } else {
    // Empty date = weighed today — shown in the preview so it stays transparent.
    const today = new Date();
    recordedAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
    dateCell = `${recordedAt} (today)`;
  }

  // In-file duplicate: same animal + same day.
  const dupKey = `${animal.id}|${recordedAt}`;
  if (seenKeys.has(dupKey)) return { ok: false, reason: "Duplicate row in file (animal already weighed that day)" };
  seenKeys.add(dupKey);

  return {
    ok: true,
    row: {
      line,
      ok: true,
      reason: null,
      label: "",
      cells: [
        String(line),
        animal.name ? `${animal.tagId} (${animal.name})` : animal.tagId,
        weightRaw,
        dateCell,
      ],
      payload: {
        animalId: animal.id,
        weightKg: weight,
        recordedAt,
        note: (rec.note ?? "").trim() || null,
      },
    },
  };
}

/** Categories the task UI understands (import is strict — see reason text). */
const TASK_CATEGORY_SET = new Set<string>(["general", "livestock", "crop", "health", "maintenance", "finance"]);
const TASK_REPEAT_MAP: Record<string, string> = {
  once: "once",
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
};

/** Validate + build one task row (r10). Only OPEN tasks are imported. */
function buildTaskRow(
  rec: Record<string, string>,
  line: number,
  animalByTag: Map<string, AnimalWithGroup>,
  groupByName: Map<string, { id: string; name: string }>,
  fieldByName: Map<string, { id: string; name: string }>,
  seenKeys: Set<string>
): { ok: boolean; reason?: string; row?: PreviewRow } {
  const title = (rec.title ?? "").trim();
  if (!title) return { ok: false, reason: "Title is required" };

  const dateRaw = rec.dueDate ?? "";
  if (!dateRaw.trim()) return { ok: false, reason: "Due date is required" };
  const dueDate = parseFlexibleDate(dateRaw);
  if (dueDate === null) {
    return { ok: false, reason: "Due date is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)" };
  }

  let dueTime: string | null = null;
  const timeRaw = (rec.dueTime ?? "").trim();
  if (timeRaw) {
    if (!/^([01]?\d|2[0-3]):([0-5]\d)$/.test(timeRaw)) {
      return { ok: false, reason: "Due time must be HH:MM (24-hour, e.g. 08:00)" };
    }
    dueTime = timeRaw;
  }

  const priorityRaw = (rec.priority ?? "").trim().toLowerCase();
  if (priorityRaw && priorityRaw !== "low" && priorityRaw !== "medium" && priorityRaw !== "high") {
    return { ok: false, reason: "Priority must be low, medium or high" };
  }
  const priority = priorityRaw || "medium";

  const repeatRaw = (rec.repeat ?? "").trim().toLowerCase();
  if (repeatRaw === "custom_days" || repeatRaw === "custom") {
    return { ok: false, reason: "Custom repeat intervals cannot be imported — set them in the app" };
  }
  if (repeatRaw && !TASK_REPEAT_MAP[repeatRaw]) {
    return { ok: false, reason: "Repeat must be once, daily, weekly or monthly" };
  }
  const repeatRule = TASK_REPEAT_MAP[repeatRaw] ?? "once";

  const statusRaw = (rec.status ?? "").trim().toLowerCase();
  if (statusRaw && statusRaw !== "open") {
    return {
      ok: false,
      reason:
        statusRaw === "done" || statusRaw === "cancelled"
          ? "Completed or cancelled tasks are not imported — only open tasks"
          : "Status must be empty or open",
    };
  }

  const categoryRaw = (rec.category ?? "").trim().toLowerCase();
  if (categoryRaw && !TASK_CATEGORY_SET.has(categoryRaw)) {
    return {
      ok: false,
      reason: "Category must be general, livestock, crop, health, maintenance or finance",
    };
  }
  const category = categoryRaw || "general";

  // Optional links — every one must resolve to a real record or the row is skipped.
  const tag = parseAnimalTag(rec.animal ?? "");
  let animalId: string | undefined;
  let groupId: string | undefined;
  let fieldId: string | undefined;
  let linkParts: string[] = [];
  if (tag) {
    const animal = animalByTag.get(tag.toLowerCase());
    if (!animal) return { ok: false, reason: `Animal tag “${tag}” not found in your records` };
    animalId = animal.id;
    linkParts.push(animal.name ? `${animal.tagId} (${animal.name})` : animal.tagId);
  }
  const groupNameRaw = (rec.group ?? "").trim();
  if (groupNameRaw) {
    const group = groupByName.get(groupNameRaw.toLowerCase());
    if (!group) return { ok: false, reason: `Group “${groupNameRaw}” not found in your records` };
    groupId = group.id;
    linkParts.push(group.name);
  }
  const fieldNameRaw = (rec.field ?? "").trim();
  if (fieldNameRaw) {
    const field = fieldByName.get(fieldNameRaw.toLowerCase());
    if (!field) return { ok: false, reason: `Field “${fieldNameRaw}” not found in your records` };
    fieldId = field.id;
    linkParts.push(field.name);
  }

  // In-file duplicate: same title + due date.
  const dupKey = `${title.toLowerCase()}|${dueDate}`;
  if (seenKeys.has(dupKey)) return { ok: false, reason: "Duplicate row in file" };
  seenKeys.add(dupKey);

  return {
    ok: true,
    row: {
      line,
      ok: true,
      reason: null,
      label: "",
      cells: [
        String(line),
        title,
        dueTime ? `${dueDate} ${dueTime}` : dueDate,
        titleCase(priority),
        linkParts.length > 0 ? linkParts.join(" · ") : "—",
      ],
      payload: {
        title,
        category,
        dueDate,
        dueTime,
        priority,
        repeatRule,
        assignee: (rec.assignee ?? "").trim() || null,
        animalId,
        groupId,
        fieldId,
        notes: (rec.notes ?? "").trim() || null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CsvImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [target, setTarget] = useState<Target>("animals");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ParseOutcome | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const expectedHeaders = TARGET_HEADERS[target];
  const readyCount = outcome?.rows.filter((r) => r.ok).length ?? 0;
  const skipCount = outcome ? outcome.rows.length - readyCount : 0;

  function resetAnalysis() {
    setError(null);
    setOutcome(null);
    setResult(null);
    setProgress(null);
  }

  function resetAll() {
    resetAnalysis();
    setFile(null);
    setDragActive(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function downloadTemplate() {
    downloadFile(
      `farm-command-${target}-import-template-${todayFileStamp()}.csv`,
      buildTemplateCsv(target),
      "text/csv"
    );
    toast.success(`Template for ${TARGET_LABEL[target].toLowerCase()} downloaded.`);
  }

  async function analyse(nextFile: File, nextTarget: Target) {
    setBusy(true);
    resetAnalysis();
    try {
      const text = await nextFile.text();
      if (!text.trim()) {
        setError("That file is empty — nothing to import. Download the template to see the expected layout.");
        return;
      }
      const parsed = parseCsv(text);
      const mapping = mapHeaders(parsed.headers, TARGET_ALIASES[nextTarget]);
      if (!mapping.some((m) => m !== null)) {
        setError(
          `No columns in “${nextFile.name}” match the expected headers. The first line must contain: ${expectedHeadersList(nextTarget)}.`
        );
        setOutcome({ columns: parsed.headers, mapping, rows: [] });
        return;
      }
      if (parsed.rows.length === 0) {
        setError("This file has headers but no data rows — add at least one row below the header line.");
        setOutcome({ columns: parsed.headers, mapping, rows: [] });
        return;
      }

      // Existing data loaded once per analysis (offline-first reads).
      let animalByTag = new Map<string, AnimalWithGroup>();
      let groupByName = new Map<string, { id: string; name: string } | null>();
      let existingTags = new Set<string>();
      if (nextTarget === "animals" || nextTarget === "vaccinations" || nextTarget === "weights") {
        try {
          const existing = await apiGet<AnimalWithGroup[]>("/api/animals");
          animalByTag = new Map(existing.map((a) => [a.tagId.toLowerCase(), a]));
          existingTags = new Set(existing.map((a) => a.tagId.toLowerCase()));
          groupByName = new Map(
            existing
              .map((a) => a.group)
              .filter((g): g is { id: string; name: string } => Boolean(g))
              .map((g) => [g.name.toLowerCase(), g])
          );
        } catch {
          // Local read should not fail, but stay honest: proceed without
          // duplicate/tag/group lookups rather than pretending they ran.
          toast.error("Existing animals could not be read — duplicate and tag checks are unavailable for this preview.");
        }
      }
      // Vaccination group resolution uses the real group list (exact names);
      // task imports also resolve field names.
      let vaccGroupByName = new Map<string, { id: string; name: string }>();
      if (nextTarget === "vaccinations") {
        try {
          const groups = await apiGet<{ id: string; name: string }[]>("/api/groups");
          vaccGroupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
        } catch {
          toast.error("Groups could not be read — group vaccinations are unavailable for this preview.");
        }
      }
      let taskGroupByName = new Map<string, { id: string; name: string }>();
      let fieldByName = new Map<string, { id: string; name: string }>();
      if (nextTarget === "tasks") {
        try {
          const groups = await apiGet<{ id: string; name: string }[]>("/api/groups");
          taskGroupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
        } catch {
          toast.error("Groups could not be read — group links are unavailable for this preview.");
        }
        try {
          const fields = await apiGet<{ id: string; name: string }[]>("/api/fields");
          fieldByName = new Map(fields.map((f) => [f.name.toLowerCase(), f]));
        } catch {
          toast.error("Fields could not be read — field links are unavailable for this preview.");
        }
      }

      const seenTags = new Set<string>();
      const seenVacKeys = new Set<string>();
      const seenWeightKeys = new Set<string>();
      const seenTaskKeys = new Set<string>();
      const rows: PreviewRow[] = [];
      for (let i = 0; i < parsed.rows.length; i++) {
        const values = parsed.rows[i];
        const rec: Record<string, string> = {};
        mapping.forEach((field, colIndex) => {
          if (field) rec[field] = (values[colIndex] ?? "").trim();
        });
        let built: { ok: boolean; reason?: string; row?: PreviewRow };
        if (nextTarget === "animals") {
          built = buildAnimalRow(rec, i + 2, existingTags, seenTags, groupByName);
        } else if (nextTarget === "vaccinations") {
          built = buildVaccinationRow(rec, i + 2, animalByTag, vaccGroupByName, seenVacKeys);
        } else if (nextTarget === "weights") {
          built = buildWeightRow(rec, i + 2, animalByTag, seenWeightKeys);
        } else if (nextTarget === "tasks") {
          built = buildTaskRow(rec, i + 2, animalByTag, taskGroupByName, fieldByName, seenTaskKeys);
        } else {
          built = buildTxRow(rec, i + 2);
        }
        if (built.ok && built.row) {
          if (nextTarget === "animals") seenTags.add((rec.tagId ?? "").trim().toLowerCase());
          rows.push(built.row);
        } else {
          const label =
            nextTarget === "animals"
              ? rec.tagId
                ? `Tag ${rec.tagId}`
                : "(no Tag ID)"
              : nextTarget === "vaccinations"
                ? rec.vaccineName
                  ? rec.vaccineName
                  : "(no vaccine)"
                : nextTarget === "weights"
                  ? rec.animal
                    ? rec.animal
                    : "(no animal)"
                  : nextTarget === "tasks"
                    ? rec.title
                      ? rec.title
                      : "(no title)"
                    : rec.description
                      ? rec.description
                      : "(no description)";
          rows.push({ line: i + 2, ok: false, reason: built.reason ?? "Invalid row", label, cells: [], payload: null });
        }
      }
      setOutcome({ columns: parsed.headers, mapping, rows });
    } catch {
      setError(`“${nextFile.name}” could not be read as text. Make sure it is a plain .csv file.`);
    } finally {
      setBusy(false);
    }
  }

  function expectedHeadersList(t: Target): string {
    return TARGET_HEADERS[t].join(", ");
  }

  function onFileChosen(nextFile: File | undefined) {
    if (!nextFile) return;
    setFile(nextFile);
    void analyse(nextFile, target);
  }

  function onTargetChange(next: string) {
    const nextTarget = next as Target;
    setTarget(nextTarget);
    if (file) void analyse(file, nextTarget);
    else resetAnalysis();
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    if (importing) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFileChosen(dropped);
  }

  async function runImport() {
    if (!outcome) return;
    const ready = outcome.rows.filter((r) => r.ok && r.payload);
    if (ready.length === 0 || importing) return;
    setImporting(true);
    setResult(null);
    setProgress({ done: 0, total: ready.length });
    let imported = 0;
    let failed = 0;
    for (let i = 0; i < ready.length; i++) {
      try {
        // Offline-first: lands in IndexedDB + outbox, syncs later.
        if (target === "weights") {
          // Weights post to the animal's own endpoint; animalId was resolved
          // during validation and is never fabricated.
          const { animalId, ...body } = ready[i].payload as Record<string, unknown>;
          await apiSend(`/api/animals/${String(animalId)}/weights`, "POST", body);
        } else {
          const path =
            target === "animals"
              ? "/api/animals"
              : target === "vaccinations"
                ? "/api/vaccinations"
                : target === "tasks"
                  ? "/api/tasks"
                  : "/api/finance";
          await apiSend(path, "POST", ready[i].payload);
        }
        imported++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: ready.length });
    }
    setImporting(false);
    setProgress(null);
    setResult({ imported, skipped: failed });
    // Clear the analysed file so a second click can never double-import,
    // but keep the result summary visible until the dialog closes.
    setError(null);
    setOutcome(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    if (imported > 0) {
      toast.success(`Imported ${imported} · Skipped ${failed}`);
      if (target === "animals") {
        queryClient.invalidateQueries({ queryKey: qk.animals });
        queryClient.invalidateQueries({ queryKey: qk.livestock });
        queryClient.invalidateQueries({ queryKey: qk.dashboard });
      } else if (target === "vaccinations") {
        // Vaccination imports also create next-due reminder tasks (facade).
        queryClient.invalidateQueries({ queryKey: qk.vaccinations });
        queryClient.invalidateQueries({ queryKey: qk.tasks });
        queryClient.invalidateQueries({ queryKey: qk.dashboard });
      } else if (target === "weights") {
        // Weight records update the animal's current weight (like the server).
        queryClient.invalidateQueries({ queryKey: qk.animals });
        queryClient.invalidateQueries({ queryKey: qk.livestock });
        queryClient.invalidateQueries({ queryKey: qk.reports });
      } else if (target === "tasks") {
        queryClient.invalidateQueries({ queryKey: qk.tasks });
        queryClient.invalidateQueries({ queryKey: qk.dashboard });
        queryClient.invalidateQueries({ queryKey: qk.summary });
      } else {
        queryClient.invalidateQueries({ queryKey: qk.finance });
        queryClient.invalidateQueries({ queryKey: qk.summary });
        queryClient.invalidateQueries({ queryKey: qk.dashboard });
      }
    } else {
      toast.error(`Nothing was imported — ${failed} row${failed === 1 ? "" : "s"} could not be saved.`);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && importing) return; // never abandon a running import
    if (!next) resetAll();
    onOpenChange(next);
  }

  const visibleRows = outcome?.rows.slice(0, PREVIEW_LIMIT) ?? [];
  const hiddenRows = (outcome?.rows.length ?? 0) - visibleRows.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="farm-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-primary" aria-hidden />
            Import from CSV
          </DialogTitle>
          <DialogDescription>
            Add many records at once from a spreadsheet. Works offline — rows are saved on this
            device first and synced to your server later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Target */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="csv-import-target">What are you importing?</Label>
            <Select value={target} onValueChange={onTargetChange}>
              <SelectTrigger id="csv-import-target" className="min-h-11 w-full sm:w-56" aria-label="Type of records to import">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="animals">Animals</SelectItem>
                <SelectItem value="transactions">Transactions</SelectItem>
                <SelectItem value="vaccinations">Vaccinations</SelectItem>
                <SelectItem value="weights">Weight records</SelectItem>
                <SelectItem value="tasks">Tasks</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Template + file dropzone */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">1. Get the layout right</p>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => void downloadTemplate()}
                disabled={importing}
              >
                <Download className="size-4" aria-hidden />
                Download template
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {target === "animals" &&
                'The template lists the exact columns Farm Command understands — Tag ID is required, everything else is optional.'}
              {target === "transactions" &&
                'The template lists the exact columns Farm Command understands — every transaction needs an amount greater than 0 and a date.'}
              {target === "vaccinations" &&
                'The Animal column takes the tag from the export (e.g. “C-023 (Mama)”) or a bare Tag ID — or leave it empty and name a Group. Next-due dates automatically create reminder tasks.'}
              {target === "weights" &&
                'The Animal column takes the tag from the export (e.g. “C-023 (Mama)”) or a bare Tag ID. Leave the date empty to record today\u2019s weight — the preview shows it.'}
              {target === "tasks" &&
                'Only open tasks are imported. Category must be general, livestock, crop, health, maintenance or finance; repeat must be once, daily, weekly or monthly. Animal, Group and Field links must match existing records.'}
            </p>

            <label
              className={`flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center transition-colors focus-within:ring-2 focus-within:ring-ring ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/40"
              } ${importing ? "pointer-events-none opacity-60" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={importing}
                onChange={(e) => onFileChosen(e.target.files?.[0])}
              />
              {busy ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Reading file…
                </span>
              ) : (
                <>
                  <FileUp className="size-5 text-muted-foreground" aria-hidden />
                  <span className="max-w-full truncate text-sm font-medium">
                    {file ? file.name : "Choose a CSV file — or drop it here"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {file ? "Tap to choose a different file" : "Files from your spreadsheet app (.csv)"}
                  </span>
                </>
              )}
            </label>
          </div>

          {/* Honest error state */}
          {error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="flex items-start gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Expected headers for {TARGET_LABEL[target]}:
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {expectedHeaders.map((h) => (
                  <code key={h} className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                    {h}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* Column mapping chips */}
          {outcome && outcome.columns.length > 0 && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Columns in your file</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {outcome.columns.map((col, i) => {
                  const mapped = outcome.mapping[i];
                  return mapped ? (
                    <span
                      key={`${col}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      <CheckCircle2 className="size-3" aria-hidden />
                      {col || `Column ${i + 1}`}
                    </span>
                  ) : (
                    <span
                      key={`${col}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {col || `Column ${i + 1}`}
                      <span className="font-medium">· ignored</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview */}
          {outcome && outcome.rows.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">2. Check the preview</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Skipped rows stay out — fix them in your file and import again. Rows marked ready are
                saved to this device when you press Import.
              </p>
              <p role="status" className="text-sm font-medium">
                <span className="text-emerald-700 dark:text-emerald-400">{readyCount} ready</span>
                {" · "}
                <span className={skipCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
                  {skipCount} will be skipped
                </span>
              </p>
              {readyCount === 0 && (
                <p role="alert" className="rounded-md border border-amber-300/60 bg-amber-50 p-2.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Nothing can be imported yet — fix the issues listed below and choose the file again.
                </p>
              )}
              <div className="farm-scroll max-h-64 overflow-x-auto overflow-y-auto rounded-md border">
                <table className="w-full min-w-[460px] text-left text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr>
                      {PREVIEW_COLUMNS[target].map((h) => (
                        <th key={h} scope="col" className="whitespace-nowrap px-2.5 py-2 font-medium text-muted-foreground">
                          {h}
                        </th>
                      ))}
                      <th scope="col" className="whitespace-nowrap px-2.5 py-2 font-medium text-muted-foreground">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.line} className="border-t">
                        {r.ok ? (
                          r.cells.map((c, i) => (
                            <td
                              key={i}
                              title={c}
                              className={
                                i === 0
                                  ? "whitespace-nowrap px-2.5 py-1.5 text-muted-foreground"
                                  : "max-w-32 truncate whitespace-nowrap px-2.5 py-1.5"
                              }
                            >
                              {c}
                            </td>
                          ))
                        ) : (
                          <td
                            colSpan={PREVIEW_COLUMNS[target].length}
                            className="px-2.5 py-1.5 text-muted-foreground"
                          >
                            Line {r.line} — {r.label}
                          </td>
                        )}
                        <td className="px-2.5 py-1.5">
                          {r.ok ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                              {r.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hiddenRows > 0 && (
                <p className="text-xs text-muted-foreground">+{hiddenRows} more row{hiddenRows === 1 ? "" : "s"} not shown.</p>
              )}
            </div>
          )}

          {/* Import progress / result — announced to screen readers */}
          <div aria-live="polite">
            {progress && (
              <p className="flex items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm font-medium">
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                Importing {progress.done} of {progress.total}…
              </p>
            )}
            {result && !progress && (
              <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-300/70 bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                Imported {result.imported}
                {result.skipped > 0 ? ` · Skipped ${result.skipped}` : ""} — done. Choose another file to import more.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={() => handleOpenChange(false)} disabled={importing}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button
            className="min-h-11"
            onClick={() => void runImport()}
            disabled={importing || busy || !outcome || readyCount === 0}
          >
            {importing && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {importing ? "Importing…" : `Import ${readyCount} row${readyCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
