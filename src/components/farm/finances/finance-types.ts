import type { FinanceTransactionDTO } from "@/lib/farm";

/** Finance row with minimal linked-entity names for display. */
export interface FinanceLinked {
  id: string;
  tagId?: string;
  name?: string;
  crop?: string;
  variety?: string | null;
}

export interface FinanceRow extends FinanceTransactionDTO {
  animal?: FinanceLinked | null;
  field?: FinanceLinked | null;
  cropCycle?: FinanceLinked | null;
  group?: FinanceLinked | null;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

export interface FinanceSummary {
  from: string | null;
  to: string | null;
  income: number;
  expense: number;
  net: number;
  count: number;
  incomeByCategory: CategoryTotal[];
  expenseByCategory: CategoryTotal[];
}

export type RangeKey = "this_month" | "last_month" | "last_3_months" | "this_year" | "all_time";

export const RANGE_LABELS: { value: RangeKey; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
  { value: "all_time", label: "All time" },
];

export const PAYMENT_METHODS = ["Cash", "Bank transfer", "Mobile money", "Credit", "Other"] as const;

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Compute the from/to ISO bounds for a named date range. */
export function rangeToFromTo(range: RangeKey): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (range) {
    case "this_month":
      return { from: new Date(y, m, 1).toISOString(), to: endOfDay(new Date(y, m + 1, 0)).toISOString() };
    case "last_month":
      return {
        from: new Date(y, m - 1, 1).toISOString(),
        to: endOfDay(new Date(y, m, 0)).toISOString(),
      };
    case "last_3_months":
      return { from: new Date(y, m - 2, 1).toISOString(), to: endOfDay(new Date(y, m + 1, 0)).toISOString() };
    case "this_year":
      return { from: new Date(y, 0, 1).toISOString(), to: endOfDay(new Date(y, 11, 31)).toISOString() };
    default:
      return {};
  }
}

/** Human label for the active range, e.g. "This month". */
export function rangeLabel(range: RangeKey): string {
  return RANGE_LABELS.find((r) => r.value === range)?.label ?? "All time";
}
