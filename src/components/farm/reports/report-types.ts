import type { FinanceTransactionDTO } from "@/lib/farm";

/** Finance row (as served by /api/finance) — reused for the monthly chart aggregation. */
export type ReportFinanceRow = FinanceTransactionDTO;

export interface SpeciesCount {
  species: string;
  count: number;
}

export interface ActiveCycle {
  id: string;
  crop: string;
  variety: string | null;
  field: string | null;
  status: string;
  plantingDate: string | null;
  expectedHarvestDate: string | null;
}

export interface HarvestRow {
  crop: string;
  quantity: number | null;
  unit: string | null;
  saleAmount: number | null;
}

export interface CatTotal {
  category: string;
  total: number;
}

export interface TypeCount {
  type: string;
  count: number;
}

export interface WeightGainRow {
  animalId: string;
  label: string;
  species: string;
  fromKg: number;
  toKg: number;
  currentKg: number;
  targetKg: number | null;
  fromDate: string;
  toDate: string;
  days: number;
  gainKg: number;
  adgKg: number;
  approx: boolean;
}

export interface ReportsPayload {
  generatedAt: string;
  livestock: {
    bySpecies: SpeciesCount[];
    totalActive: number;
    groupsCount: number;
    recentDeaths: number;
  };
  health: {
    vaccinationsDue30: number;
    overdueVaccinations: number;
    last30Events: number;
  };
  crops: {
    activeCycles: ActiveCycle[];
    harvestedThisYear: HarvestRow[];
    fieldsCount: number;
    totalArea: number | null;
  };
  finance: {
    from: string | null;
    to: string | null;
    income: number;
    expense: number;
    byCategoryIncome: CatTotal[];
    byCategoryExpense: CatTotal[];
  };
  tasks: {
    completed30: number;
    overdue: number;
    openTotal: number;
    byCategory: { category: string; count: number }[];
  };
  activities: {
    last30ByType: TypeCount[];
  };
  weightGain: {
    windowDays: number;
    rows: WeightGainRow[];
    gaining: number;
    losing: number;
    herdAvgAdg: number;
  };
}

export interface MonthPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
}

/** Bucket transactions into the last N months (oldest first) for the bar chart. */
export function monthlyIncomeExpense(rows: ReportFinanceRow[], months = 6): MonthPoint[] {
  const now = new Date();
  const buckets: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      income: 0,
      expense: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const r of rows) {
    const d = new Date(r.date);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!bucket) continue;
    if (r.type === "income") bucket.income += r.amount;
    else bucket.expense += r.amount;
  }
  return buckets;
}

/** CSV tables offered by the export dropdown. */
export const CSV_TABLES: { value: string; label: string }[] = [
  { value: "animals", label: "Animals" },
  { value: "groups", label: "Livestock groups" },
  { value: "tasks", label: "Tasks" },
  { value: "transactions", label: "Transactions" },
  { value: "vaccinations", label: "Vaccinations" },
  { value: "activities", label: "Activities" },
  { value: "fields", label: "Fields" },
  { value: "crops", label: "Crop cycles" },
  { value: "health-events", label: "Health events" },
  { value: "weights", label: "Weight records" },
  { value: "rainfall", label: "Rainfall log" },
];
