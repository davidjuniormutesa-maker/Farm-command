/**
 * Farm Command — shared domain types, constants and helpers.
 * This file is the contract between API routes and UI components.
 * Dates cross the API boundary as ISO strings.
 */

// ---------- DTOs (JSON shape of Prisma models) ----------

export interface FarmSettingsData {
  farmName: string;
  ownerName: string;
  location: string;
  latitude?: number;
  longitude?: number;
  currency: string; // "ZMW"
  units: string; // "metric"
  timezone: string;
  onboarded: boolean;
  notificationsEnabled: boolean;
  reminderLeadDays: number;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  showBirthdayGreeting: boolean;
  aiEnabled: boolean;
  /** Monthly expense budgets per category (kwacha) — persisted as JSON in settings. */
  expenseBudgets: Record<string, number>;
}

export interface LivestockGroupDTO {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  count: number;
  breedingMaleCount?: number | null;
  breedingFemaleCount?: number | null;
  youngCount?: number | null;
  castratedCount?: number | null;
  location?: string | null;
  acquisition?: string | null;
  status: string;
  notes?: string | null;
  photo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnimalDTO {
  id: string;
  tagId: string;
  name?: string | null;
  species: string;
  breed?: string | null;
  sex?: string | null;
  birthDate?: string | null;
  estimatedAge?: string | null;
  acquisition?: string | null;
  acquisitionDate?: string | null;
  location?: string | null;
  status: string;
  weightKg?: number | null;
  targetWeightKg?: number | null;
  notes?: string | null;
  photo?: string | null;
  groupId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeightRecordDTO {
  id: string;
  animalId: string;
  weightKg: number;
  recordedAt: string;
  note?: string | null;
}

export interface HealthEventDTO {
  id: string;
  animalId?: string | null;
  groupId?: string | null;
  type: string;
  title: string;
  date: string;
  details?: string | null;
  administeredBy?: string | null;
  medication?: string | null;
  withdrawalDays?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaccinationDTO {
  id: string;
  animalId?: string | null;
  groupId?: string | null;
  vaccineName: string;
  dateGiven: string;
  nextDueDate?: string | null;
  batchNumber?: string | null;
  administeredBy?: string | null;
  notes?: string | null;
  attachment?: string | null;
  reminderTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FieldDTO {
  id: string;
  name: string;
  areaHa?: number | null;
  location?: string | null;
  soilNotes?: string | null;
  irrigation?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CropCycleDTO {
  id: string;
  crop: string;
  variety?: string | null;
  fieldId?: string | null;
  plantingDate?: string | null;
  expectedHarvestDate?: string | null;
  actualHarvestDate?: string | null;
  seedDetails?: string | null;
  harvestQuantity?: number | null;
  harvestUnit?: string | null;
  saleAmount?: number | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FarmActivityDTO {
  id: string;
  type: string;
  title: string;
  date: string;
  details?: string | null;
  cost?: number | null;
  cropCycleId?: string | null;
  fieldId?: string | null;
  animalId?: string | null;
  groupId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = "overdue" | "due_today" | "upcoming" | "done" | "cancelled";

export interface TaskDTO {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  dueDate: string;
  dueTime?: string | null;
  priority: string;
  repeatRule: string;
  repeatIntervalDays?: number | null;
  leadTimeDays: number;
  animalId?: string | null;
  groupId?: string | null;
  cropCycleId?: string | null;
  fieldId?: string | null;
  assignee?: string | null;
  status: string; // open | done | cancelled
  completedAt?: string | null;
  nextOccurrenceId?: string | null;
  vaccinationId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceTransactionDTO {
  id: string;
  type: "income" | "expense" | string;
  category: string;
  amount: number;
  date: string;
  description: string;
  paymentMethod?: string | null;
  receipt?: string | null;
  cropCycleId?: string | null;
  fieldId?: string | null;
  animalId?: string | null;
  groupId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticleDTO {
  id: string;
  title: string;
  topic: string;
  source: string;
  sourceUrl?: string | null;
  publishedDate?: string | null;
  retrievedDate: string;
  summary: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeatherDayDTO {
  date: string;
  tempMax: number;
  tempMin: number;
  rainMm: number;
  humidity: number;
  windMax: number;
  code: number;
}

export interface WeatherDataDTO {
  location: string;
  temperature: number;
  apparent: number;
  humidity: number;
  wind: number;
  rainMm: number;
  code: number;
  forecast: WeatherDayDTO[];
  fetchedAt: string;
  cached: boolean;
  /** True when this snapshot came from the offline cache and may be outdated. */
  stale?: boolean;
}

export interface RainfallReadingDTO {
  id: string;
  date: string;
  mm: number;
  note?: string | null;
}

export interface RainfallResponseDTO {
  readings: RainfallReadingDTO[];
  today: number | null;
  last7: number;
  last30: number;
  last12Months: number;
  lastRain: { date: string; mm: number } | null;
}

export interface SummaryCounts {
  livestockTotal: number;
  groupTotal: number;
  activeCrops: number;
  fieldsTotal: number;
  openTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  upcomingVaccinations: number;
  overdueVaccinations: number;
  monthIncome: number;
  monthExpense: number;
}

// ---------- Domain constants ----------

export const SPECIES = ["Cattle", "Goats", "Sheep", "Pigs", "Poultry", "Other"] as const;

// ---------- Group role breakdown (simple patriarch/matriarch/young/castrated) ----------

export type AnimalRole = "breedingMale" | "breedingFemale" | "young" | "castrated";

/** Fixed, species-neutral labels shown before each count. */
export const ROLE_LABEL: Record<AnimalRole, string> = {
  breedingMale: "Patriarchs",
  breedingFemale: "Matriarchs",
  young: "Young",
  castrated: "Castrated",
};

/** Species-correct animal words as [singular, plural] per role. */
const SPECIES_ROLE_WORDS: Record<string, Record<AnimalRole, [string, string]>> = {
  Cattle: {
    breedingMale: ["bull", "bulls"],
    breedingFemale: ["cow", "cows"],
    young: ["calf", "calves"],
    castrated: ["steer", "steers"],
  },
  Goats: {
    breedingMale: ["buck", "bucks"],
    breedingFemale: ["doe", "does"],
    young: ["kid", "kids"],
    castrated: ["wether", "wethers"],
  },
  Sheep: {
    breedingMale: ["ram", "rams"],
    breedingFemale: ["ewe", "ewes"],
    young: ["lamb", "lambs"],
    castrated: ["wether", "wethers"],
  },
  Pigs: {
    breedingMale: ["boar", "boars"],
    breedingFemale: ["sow", "sows"],
    young: ["piglet", "piglets"],
    castrated: ["barrow", "barrows"],
  },
  Poultry: {
    breedingMale: ["cock", "cocks"],
    breedingFemale: ["hen", "hens"],
    young: ["chick", "chicks"],
    castrated: ["capon", "capons"],
  },
  Other: {
    breedingMale: ["male", "males"],
    breedingFemale: ["female", "females"],
    young: ["young", "young"],
    castrated: ["castrated", "castrated"],
  },
};

const ROLE_ORDER: AnimalRole[] = ["breedingMale", "breedingFemale", "young", "castrated"];

/** The species-correct word for a role, singular when count === 1. */
export function groupRoleWord(species: string, role: AnimalRole, count: number): string {
  const table = SPECIES_ROLE_WORDS[species] ?? SPECIES_ROLE_WORDS.Other;
  const [singular, plural] = table[role];
  return count === 1 ? singular : plural;
}

type GroupRoleCounts = {
  species: string;
  breedingMaleCount?: number | null;
  breedingFemaleCount?: number | null;
  youngCount?: number | null;
  castratedCount?: number | null;
};

function roleCountFor(group: GroupRoleCounts, role: AnimalRole): number {
  const map: Record<AnimalRole, number | null | undefined> = {
    breedingMale: group.breedingMaleCount,
    breedingFemale: group.breedingFemaleCount,
    young: group.youngCount,
    castrated: group.castratedCount,
  };
  const n = map[role];
  return typeof n === "number" && n > 0 ? n : 0;
}

/**
 * Build the one-line role summary, e.g.
 *   "Patriarchs: 1 ram · Matriarchs: 4 ewes · Young: 11 lambs"
 * Only roles with a positive count are shown. Returns null when none are set.
 */
export function groupRoleSummary(group: GroupRoleCounts): string | null {
  const parts: string[] = [];
  for (const role of ROLE_ORDER) {
    const count = roleCountFor(group, role);
    if (count > 0) {
      parts.push(`${ROLE_LABEL[role]}: ${count} ${groupRoleWord(group.species, role, count)}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ---------- Poultry (own section: flocks + daily egg collection) ----------

export const BIRD_TYPES = ["Chickens", "Ducks", "Quail", "Turkeys", "Geese"] as const;

export const BIRD_TYPE_EMOJI: Record<string, string> = {
  Chickens: "🐔",
  Ducks: "🦆",
  Quail: "🐦",
  Turkeys: "🦃",
  Geese: "🪶",
};

/** Species-correct bird words as [singular, plural] per role and bird type. */
const BIRD_ROLE_WORDS: Record<string, Record<AnimalRole, [string, string]>> = {
  Chickens: {
    breedingMale: ["cock", "cocks"],
    breedingFemale: ["hen", "hens"],
    young: ["chick", "chicks"],
    castrated: ["capon", "capons"],
  },
  Ducks: {
    breedingMale: ["drake", "drakes"],
    breedingFemale: ["duck", "ducks"],
    young: ["duckling", "ducklings"],
    castrated: ["castrated duck", "castrated ducks"],
  },
  Quail: {
    breedingMale: ["cock", "cocks"],
    breedingFemale: ["hen", "hens"],
    young: ["chick", "chicks"],
    castrated: ["castrated", "castrated"],
  },
  Turkeys: {
    breedingMale: ["tom", "toms"],
    breedingFemale: ["hen", "hens"],
    young: ["poult", "poults"],
    castrated: ["capon", "capons"],
  },
  Geese: {
    breedingMale: ["gander", "ganders"],
    breedingFemale: ["goose", "geese"],
    young: ["gosling", "goslings"],
    castrated: ["castrated", "castrated"],
  },
};

/** The bird-correct word for a role, singular when count === 1. */
export function birdRoleWord(birdType: string, role: AnimalRole, count: number): string {
  const table = BIRD_ROLE_WORDS[birdType] ?? BIRD_ROLE_WORDS.Chickens;
  const [singular, plural] = table[role];
  return count === 1 ? singular : plural;
}

type FlockRoleCounts = {
  birdType: string;
  breedingMaleCount?: number | null;
  breedingFemaleCount?: number | null;
  youngCount?: number | null;
  castratedCount?: number | null;
};

function flockRoleCountFor(flock: FlockRoleCounts, role: AnimalRole): number {
  const map: Record<AnimalRole, number | null | undefined> = {
    breedingMale: flock.breedingMaleCount,
    breedingFemale: flock.breedingFemaleCount,
    young: flock.youngCount,
    castrated: flock.castratedCount,
  };
  const n = map[role];
  return typeof n === "number" && n > 0 ? n : 0;
}

/**
 * One-line role summary for a flock, e.g.
 *   "Patriarchs: 1 drake · Matriarchs: 6 ducks · Young: 12 ducklings"
 * Only roles with a positive count are shown. Returns null when none are set.
 */
export function flockRoleSummary(flock: FlockRoleCounts): string | null {
  const parts: string[] = [];
  for (const role of ROLE_ORDER) {
    const count = flockRoleCountFor(flock, role);
    if (count > 0) {
      parts.push(`${ROLE_LABEL[role]}: ${count} ${birdRoleWord(flock.birdType, role, count)}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface PoultryFlockDTO {
  id: string;
  name: string;
  birdType: string;
  breed?: string | null;
  count: number;
  breedingMaleCount?: number | null;
  breedingFemaleCount?: number | null;
  youngCount?: number | null;
  castratedCount?: number | null;
  location?: string | null;
  feedNote?: string | null;
  status: string;
  notes?: string | null;
  photo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EggLogDTO {
  id: string;
  flockId: string;
  date: string;
  eggs: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Flock detail response: the flock plus its recent egg logs and totals. */
export interface PoultryFlockWithEggsDTO extends PoultryFlockDTO {
  eggLogs: EggLogDTO[];
  eggsToday: number;
  eggsLast7Days: number;
  eggsTotal: number;
}

export const ZAMBIA_CROPS = [
  "Maize",
  "Soybeans",
  "Beans",
  "Groundnuts",
  "Sorghum",
  "Millet",
  "Cassava",
  "Vegetables",
  "Other",
] as const;

export const TASK_CATEGORIES = [
  "general",
  "livestock",
  "crop",
  "health",
  "maintenance",
  "finance",
] as const;

export const PRIORITIES = ["low", "medium", "high"] as const;

export const REPEAT_RULES = ["once", "daily", "weekly", "monthly", "custom_days"] as const;

export const INCOME_CATEGORIES = [
  "Crop sales",
  "Livestock sales",
  "Milk/Eggs/Produce",
  "Services",
  "Other income",
] as const;

export const EXPENSE_CATEGORIES = [
  "Seed",
  "Fertilizer",
  "Feed",
  "Veterinary",
  "Labour",
  "Fuel",
  "Transport",
  "Equipment",
  "Repairs",
  "Utilities",
  "Other",
] as const;

export const ACTIVITY_TYPES = [
  "planting",
  "fertilizer",
  "spraying",
  "irrigation",
  "weeding",
  "scouting",
  "harvesting",
  "equipment",
  "fencing",
  "feeding",
  "water",
  "transport",
  "other",
] as const;

export const HEALTH_EVENT_TYPES = [
  "observation",
  "treatment",
  "vet_visit",
  "breeding",
  "pregnancy",
  "birth",
  "death",
  "movement",
  "note",
] as const;

export const HARVEST_UNITS = ["kg", "bags (50kg)", "tonnes", "crates", "bales", "litres", "other"] as const;

export const VACCINATION_STATUS = {
  UPCOMING: "Upcoming",
  DUE_TODAY: "Due today",
  OVERDUE: "Overdue",
  COMPLETED: "Completed",
} as const;

// ---------- Breeding & gestation ----------

/** Average gestation lengths in days (Poultry = incubation, informational). */
export const GESTATION_DAYS: Record<string, number> = {
  Cattle: 283,
  Goats: 150,
  Sheep: 152,
  Pigs: 114,
  Poultry: 21,
};

export interface GestationInfo {
  bredOn: string; // ISO timestamp of the breeding event
  expectedOn: string; // ISO timestamp of expected delivery/hatch
  daysRemaining: number; // calendar days from today (negative = overdue)
  progressPct: number; // 0–100 through the gestation window
  overdue: boolean;
  stage: string; // "Early stage" | "Mid stage" | "Final stretch"
}

/**
 * Active gestation for one animal, derived purely from its health-event
 * history: the most recent `breeding` event that has NOT been followed by a
 * `birth` event. No extra data model — the records you already keep are the
 * source of truth. Returns null when the species has no known gestation or
 * there is no open breeding cycle.
 */
export function computeGestation(
  events: Array<Pick<HealthEventDTO, "type" | "date">>,
  species: string,
): GestationInfo | null {
  const gestationDays = GESTATION_DAYS[species];
  if (!gestationDays) return null;

  const bredMs = events
    .filter((e) => e.type === "breeding")
    .map((e) => Date.parse(e.date))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a)[0];
  if (bredMs == null) return null;

  // A birth recorded after the breeding closes the cycle.
  const cycleClosed = events.some(
    (e) => e.type === "birth" && !Number.isNaN(Date.parse(e.date)) && Date.parse(e.date) > bredMs,
  );
  if (cycleClosed) return null;

  const expectedMs = bredMs + gestationDays * 86_400_000;
  const todayMs = startOfToday().getTime();
  const daysRemaining = Math.round((expectedMs - todayMs) / 86_400_000);
  const progressPct = Math.max(
    0,
    Math.min(100, Math.round(((todayMs - bredMs) / (expectedMs - bredMs)) * 100)),
  );
  const stage = progressPct < 40 ? "Early stage" : progressPct < 75 ? "Mid stage" : "Final stretch";

  return {
    bredOn: new Date(bredMs).toISOString(),
    expectedOn: new Date(expectedMs).toISOString(),
    daysRemaining,
    progressPct,
    overdue: daysRemaining < 0,
    stage,
  };
}

// ---------- Formatting helpers ----------

export function formatKwacha(amount: number | null | undefined, opts?: { compact?: boolean }): string {
  const value = typeof amount === "number" && isFinite(amount) ? amount : 0;
  if (opts?.compact && Math.abs(value) >= 1000) {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sign}K ${trimZero((abs / 1_000_000).toFixed(1))}M`;
    return `${sign}K ${trimZero((abs / 1000).toFixed(1))}K`;
  }
  return `K ${value.toLocaleString("en-ZM", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function from_dateInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = startOfToday();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// ---------- Status logic (shared by tasks, vaccinations, UI badges) ----------

export function computeTaskStatus(task: TaskDTO): TaskStatus {
  if (task.status === "done") return "done";
  if (task.status === "cancelled") return "cancelled";
  const days = daysUntil(task.dueDate);
  if (days === null) return "upcoming";
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  return "upcoming";
}

export function computeVaccinationStatus(v: VaccinationDTO): string {
  if (!v.nextDueDate) return VACCINATION_STATUS.COMPLETED;
  const days = daysUntil(v.nextDueDate);
  if (days === null) return VACCINATION_STATUS.COMPLETED;
  if (days < 0) return VACCINATION_STATUS.OVERDUE;
  if (days === 0) return VACCINATION_STATUS.DUE_TODAY;
  return VACCINATION_STATUS.UPCOMING;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Upcoming",
  done: "Completed",
  cancelled: "Cancelled",
};

/** Tailwind classes for task / vaccination status pills */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case "overdue":
    case "Overdue":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900";
    case "due_today":
    case "Due today":
      return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
    case "upcoming":
    case "Upcoming":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
    case "done":
    case "Completed":
      return "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800/60 dark:text-stone-300 dark:border-stone-700";
    case "planned":
      return "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900";
    case "growing":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
    case "harvested":
      return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900";
    case "medium":
      return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
    default:
      return "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800/60 dark:text-stone-300 dark:border-stone-700";
  }
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initialsOf(s: string): string {
  return s
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Weather code → short label (Open-Meteo WMO codes) */
export function weatherLabel(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorm";
}

export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}
