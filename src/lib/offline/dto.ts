/**
 * Farm Command — view-facing DTO types used by the offline facade.
 * These extend the shared API DTOs with the local sync metadata, exactly the
 * shapes the UI components already consumed from the old server API.
 */

import type {
  AnimalDTO,
  CropCycleDTO,
  FarmActivityDTO,
  FieldDTO,
  FinanceTransactionDTO,
  HealthEventDTO,
  LivestockGroupDTO,
  TaskDTO,
  VaccinationDTO,
} from "@/lib/farm";
import type { FarmMapItemDTO, BackupCounts } from "./types";

export type AnimalWithGroupDTO = AnimalDTO & { group?: { id: string; name: string } | null };
export type HealthEventWithRefsDTO = HealthEventDTO & {
  animal?: { id: string; tagId: string; name: string | null } | null;
  group?: { id: string; name: string } | null;
};
export type VaccinationWithRefsDTO = VaccinationDTO & {
  animal?: { id: string; tagId: string; name: string | null } | null;
  group?: { id: string; name: string } | null;
};
export type TaskWithLinksDTO = TaskDTO & {
  animal?: { id: string; tagId: string; name: string | null } | null;
  group?: { id: string; name: string } | null;
  cropCycle?: { id: string; crop: string; variety: string | null } | null;
  field?: { id: string; name: string } | null;
};
export type CropCycleWithFieldDTO = CropCycleDTO & { field?: { id: string; name: string } | null };
export type FieldWithCyclesDTO = FieldDTO & {
  cropCycles: {
    id: string;
    crop: string;
    variety: string | null;
    status: string;
    plantingDate: string | null;
    expectedHarvestDate: string | null;
  }[];
};
export type FarmActivityWithNamesDTO = FarmActivityDTO & {
  animal?: { id: string; tagId: string; name: string | null } | null;
  group?: { id: string; name: string } | null;
  field?: { id: string; name: string } | null;
  cropCycle?: { id: string; crop: string; variety: string | null } | null;
};
export type FinanceRowDTO = FinanceTransactionDTO & {
  animal?: { id: string; tagId: string; name: string | null } | null;
  group?: { id: string; name: string } | null;
  field?: { id: string; name: string } | null;
  cropCycle?: { id: string; crop: string; variety: string | null } | null;
};
export type KnowledgeArticleItemDTO = import("@/lib/farm").KnowledgeArticleDTO & { userAdded: boolean };
export type MapItemDTOResponse = FarmMapItemDTO;
export type BackupCountsResponse = BackupCounts;

/** Dashboard aggregate (computed locally from IndexedDB — shape of the old GET /api/dashboard). */
export interface DashboardData {
  attention: { overdueTasks: number; dueTodayTasks: number; overdueVaccinations: number; nearingHarvest: number };
  glance: { livestockTotal: number; groupTotal: number; activeCrops: number; fieldsTotal: number; openTasks: number };
  tasks: { overdue: TaskWithLinksDTO[]; overdueCount: number; dueToday: TaskWithLinksDTO[]; dueTodayCount: number; upcoming: TaskWithLinksDTO[] };
  vaccinations: {
    overdue: { id: string; vaccineName: string; target: string; nextDueDate: string; days: number }[];
    soon: { id: string; vaccineName: string; target: string; nextDueDate: string; days: number }[];
  };
  crops: {
    active: { id: string; crop: string; variety: string | null; field: string | null; status: string; expectedHarvestDate: string | null }[];
    nearingHarvest: { id: string; crop: string; field: string | null; expectedHarvestDate: string; days: number }[];
  };
  finances: { monthIncome: number; monthExpense: number; monthNet: number; topExpenseCategories: { category: string; total: number; label: string }[] };
  recentActivities: { id: string; type: string; title: string; date: string; details: string | null; linkLabel: string | null }[];
  todayISO: string;
}

/** Finance summary aggregate (shape of the old GET /api/finance/summary). */
export interface FinanceSummaryDTO {
  from: string | null;
  to: string | null;
  income: number;
  expense: number;
  net: number;
  count: number;
  incomeByCategory: { category: string; total: number }[];
  expenseByCategory: { category: string; total: number }[];
}

/** Reports aggregate (shape of the old GET /api/reports). */
export interface ReportsPayloadDTO {
  generatedAt: string;
  livestock: { bySpecies: { species: string; count: number }[]; totalActive: number; groupsCount: number; recentDeaths: number };
  health: { vaccinationsDue30: number; overdueVaccinations: number; last30Events: number };
  crops: {
    activeCycles: { id: string; crop: string; variety: string | null; field: string | null; status: string; plantingDate: string | null; expectedHarvestDate: string | null }[];
    harvestedThisYear: { crop: string; quantity: number | null; unit: string | null; saleAmount: number | null }[];
    fieldsCount: number;
    totalArea: number | null;
  };
  finance: {
    from: string | null;
    to: string | null;
    income: number;
    expense: number;
    byCategoryIncome: { category: string; total: number }[];
    byCategoryExpense: { category: string; total: number }[];
  };
  tasks: { completed30: number; overdue: number; openTotal: number; byCategory: { category: string; count: number }[] };
  activities: { last30ByType: { type: string; count: number }[] };
  weightGain: {
    windowDays: number;
    rows: {
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
    }[];
    gaining: number;
    losing: number;
    herdAvgAdg: number;
  };
}

export type LivestockGroupDetailDTO = LivestockGroupDTO;

// Re-exports so sibling modules can import base DTOs from one place.
export type {
  AnimalDTO,
  CropCycleDTO,
  FarmActivityDTO,
  FieldDTO,
  FinanceTransactionDTO,
  HealthEventDTO,
  KnowledgeArticleDTO,
  LivestockGroupDTO,
  RainfallResponseDTO,
  TaskDTO,
  VaccinationDTO,
  WeatherDataDTO,
  FarmSettingsData,
} from "@/lib/farm";
