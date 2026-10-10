"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiGet, apiSend, qk } from "@/lib/api";
import { toast } from "sonner";
import { CircleDollarSign, Plus } from "lucide-react";
import { useFarmStore } from "../store";
import { BudgetCard } from "./budget-card";
import { CategoryBreakdown } from "./category-breakdown";
import {
  RANGE_LABELS,
  rangeLabel,
  rangeToFromTo,
  type FinanceRow,
  type FinanceSummary,
  type RangeKey,
} from "./finance-types";
import { SummaryCards } from "./summary-cards";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransactionsList } from "./transactions-list";

type TypeFilter = "all" | "income" | "expense";

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Money in & out" },
  { value: "income", label: "Income only" },
  { value: "expense", label: "Expenses only" },
];

export default function FinancesView() {
  const queryClient = useQueryClient();
  const [rangeKey, setRangeKey] = useState<RangeKey>("this_month");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceRow | null>(null);

  // Quick action from the dashboard: open the create dialog (derived in render — no effects).
  const quickAction = useFarmStore((s) => s.quickAction);
  const consumeQuickAction = useFarmStore((s) => s.consumeQuickAction);
  const quickOpen = quickAction === "add-transaction";

  const { from, to } = useMemo(() => rangeToFromTo(rangeKey), [rangeKey]);

  const listQuery = useQuery({
    queryKey: [...qk.finance, "list", { type: typeFilter, from: from ?? null, to: to ?? null }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (typeFilter !== "all") p.set("type", typeFilter);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString();
      return apiGet<FinanceRow[]>(`/api/finance${qs ? `?${qs}` : ""}`);
    },
  });

  const summaryQuery = useQuery({
    queryKey: [...qk.finance, "summary", { from: from ?? null, to: to ?? null }],
    queryFn: () => {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString();
      return apiGet<FinanceSummary>(`/api/finance/summary${qs ? `?${qs}` : ""}`);
    },
  });

  function invalidateFinance() {
    queryClient.invalidateQueries({ queryKey: qk.finance });
    queryClient.invalidateQueries({ queryKey: qk.summary });
    queryClient.invalidateQueries({ queryKey: qk.dashboard });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiSend<{ ok: boolean }>(`/api/finance/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("Transaction deleted");
      invalidateFinance();
    },
    onError: (err: Error) => toast.error(err.message || "Could not delete the transaction"),
  });

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    if (quickOpen) consumeQuickAction();
    invalidateFinance();
  }

  const rows = listQuery.data ?? [];
  const dialogVisible = formOpen || quickOpen;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CircleDollarSign className="size-5" aria-hidden />
            </span>
            Finances
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your farm record book — sales in, costs out, all in kwacha.
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
            <SelectTrigger className="min-h-11 w-[170px]" aria-label="Date range filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_LABELS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="min-h-11 w-[160px]" aria-label="Transaction type filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTERS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="min-h-11 flex-1 sm:flex-none">
            <Plus className="size-4" aria-hidden />
            Record Transaction
          </Button>
        </div>
      </div>

      {/* Summary */}
      <SummaryCards summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />

      {/* Monthly budgets (r10) */}
      <BudgetCard />

      {/* Category breakdown */}
      <CategoryBreakdown
        incomeByCategory={summaryQuery.data?.incomeByCategory ?? []}
        expenseByCategory={summaryQuery.data?.expenseByCategory ?? []}
        isLoading={summaryQuery.isLoading}
      />

      {/* Register */}
      <div>
        <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
          Showing {rangeLabel(rangeKey).toLowerCase()}
          {typeFilter !== "all" ? ` · ${TYPE_FILTERS.find((t) => t.value === typeFilter)?.label.toLowerCase()}` : ""}
          {rows.length > 0 ? ` · ${rows.length} entr${rows.length === 1 ? "y" : "ies"}` : ""}
        </p>
        <TransactionsList
          rows={rows}
          isLoading={listQuery.isLoading}
          onEdit={(row) => {
            setEditing(row);
            setFormOpen(true);
          }}
          onDelete={(row) => deleteMutation.mutate(row.id)}
          deletingId={deleteMutation.variables ?? null}
          onRecordFirst={openCreate}
        />
      </div>

      {/* Create / edit dialog — mounted only while open, keyed by editing id */}
      {dialogVisible && <TransactionFormDialog key={editing?.id ?? "new"} editing={editing} onClose={closeForm} />}
    </div>
  );
}
