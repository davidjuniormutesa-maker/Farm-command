"use client";

/**
 * BudgetCard (r10) — monthly expense budgets per category.
 *
 * Budgets live in FarmSettings (`expenseBudgets`, a JSON record of category →
 * kwacha) so they sync like every other setting — offline edits land in the
 * outbox and reach the server later. Spending comes from the local finance
 * summary for the CURRENT calendar month, so the card is always about "this
 * month" regardless of the register's range filter.
 *
 * Honesty: only categories the farmer actually gave a budget get a row;
 * categories without budgets never block or warn. Overspend is shown, never
 * hidden — and never invented: empty budgets mean "no budget tracked yet".
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PiggyBank, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, qk } from "@/lib/api";
import { EXPENSE_CATEGORIES, formatKwacha, titleCase } from "@/lib/farm";
import type { FinanceSummary } from "./finance-types";

/** Month-to-date spending for the current calendar month. */
function useMonthSpending() {
  const { from, to } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    return { from: start, to: end };
  }, []);
  return useQuery({
    queryKey: [...qk.finance, "summary", { from, to }],
    queryFn: () => {
      const p = new URLSearchParams({ from, to });
      return apiGet<FinanceSummary>(`/api/finance/summary?${p.toString()}`);
    },
  });
}

/** Bar colour by share of budget used: calm → caution → over. */
function barTone(pct: number): { track: string; chip: string } {
  if (pct >= 100) {
    return {
      track: "bg-destructive",
      chip: "border-destructive/30 bg-destructive/10 text-destructive",
    };
  }
  if (pct >= 75) {
    return {
      track: "bg-gold",
      chip: "border-gold/40 bg-gold/10 text-gold-foreground",
    };
  }
  return {
    track: "bg-success",
    chip: "border-success/30 bg-success/10 text-success",
  };
}

interface BudgetRow {
  category: string;
  budget: number;
  spent: number;
  pct: number;
}

export function BudgetCard() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const settingsQuery = useQuery({
    queryKey: qk.settings,
    queryFn: () => apiGet<Record<string, unknown>>("/api/settings"),
  });
  const spendingQuery = useMonthSpending();

  const budgets = (settingsQuery.data?.expenseBudgets ?? {}) as Record<string, number>;
  const expenseByCategory = spendingQuery.data?.expenseByCategory ?? [];

  const rows = useMemo<BudgetRow[]>(() => {
    const spentBy = new Map(expenseByCategory.map((c) => [c.category, c.total]));
    return Object.entries(budgets)
      .map(([category, budget]) => {
        const spent = spentBy.get(category) ?? 0;
        return { category, budget, spent, pct: budget > 0 ? (spent / budget) * 100 : 0 };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [budgets, expenseByCategory]);

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const budgetedSpent = rows.reduce((s, r) => s + r.spent, 0);
  const hasBudgets = totalBudget > 0;

  // Days left in the current month (inclusive of today).
  const daysLeft = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return end - now.getDate() + 1;
  }, []);

  const isLoading = settingsQuery.isLoading || spendingQuery.isLoading;

  return (
    <section aria-label="Monthly budgets" className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gold/15 text-gold-foreground">
              <PiggyBank className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-semibold leading-tight">Monthly budgets</h3>
              <p className="text-xs text-muted-foreground">
                Spending guardrails for this month · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="min-h-9 gap-1.5 sm:min-h-11"
            onClick={() => setEditOpen(true)}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {hasBudgets ? "Edit budgets" : "Set budgets"}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3" aria-hidden>
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : !hasBudgets ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">No budgets yet</p>
              <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
                Set a monthly limit per expense category — Feed, Labour, Fuel — and this card shows
                how the month is tracking. Works offline, like everything here.
              </p>
            </div>
            <Button variant="outline" className="min-h-11 shrink-0" onClick={() => setEditOpen(true)}>
              <SlidersHorizontal className="size-4" aria-hidden />
              Set budgets
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Overall */}
            <div>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold tabular-nums">
                  {formatKwacha(budgetedSpent)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    of {formatKwacha(totalBudget)} spent
                  </span>
                </p>
                {budgetedSpent > totalBudget ? (
                  <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium tabular-nums text-destructive">
                    Over by {formatKwacha(budgetedSpent - totalBudget)}
                  </span>
                ) : (
                  <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium tabular-nums text-success">
                    {formatKwacha(totalBudget - budgetedSpent)} left
                  </span>
                )}
              </div>
              <div
                role="progressbar"
                aria-label="Total budget used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round((budgetedSpent / totalBudget) * 100))}
                className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${barTone((budgetedSpent / totalBudget) * 100).track}`}
                  style={{ width: `${Math.min(100, (budgetedSpent / totalBudget) * 100)}%` }}
                />
              </div>
            </div>

            {/* Per-category rows */}
            <ul className="flex flex-col gap-3">
              {rows.map((r) => {
                const tone = barTone(r.pct);
                return (
                  <li key={r.category} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="text-sm font-medium">{titleCase(r.category)}</span>
                      <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                        {r.pct >= 100 ? (
                          <span className={`rounded-full border px-1.5 py-0.5 font-medium ${tone.chip}`}>
                            Over by {formatKwacha(r.spent - r.budget)}
                          </span>
                        ) : (
                          <span className={`rounded-full border px-1.5 py-0.5 font-medium ${tone.chip}`}>
                            {formatKwacha(r.budget - r.spent)} left
                          </span>
                        )}
                        <span>
                          {formatKwacha(r.spent, { compact: true })} / {formatKwacha(r.budget, { compact: true })}
                        </span>
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${titleCase(r.category)} budget used`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, Math.round(r.pct))}
                      className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${tone.track}`}
                        style={{ width: `${Math.min(100, r.pct)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Categories spent WITHOUT a budget — visible, not judged */}
            {(() => {
              const unbudgeted = expenseByCategory.filter((c) => !budgets[c.category]);
              if (unbudgeted.length === 0) return null;
              return (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Also spent this month (no budget set):{" "}
                  {unbudgeted
                    .map((c) => `${titleCase(c.category)} ${formatKwacha(c.total, { compact: true })}`)
                    .join(" · ")}
                </p>
              );
            })()}
          </div>
        )}
      </div>

      {editOpen && (
        <BudgetEditDialog
          budgets={budgets}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            queryClient.invalidateQueries({ queryKey: qk.settings });
            toast.success("Budgets saved");
          }}
        />
      )}
    </section>
  );
}

/** Per-category budget editor — saves through the offline-first facade. */
function BudgetEditDialog({
  budgets,
  onClose,
  onSaved,
}: {
  budgets: Record<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, budgets[c] != null ? String(budgets[c]) : ""]))
  );
  const [saving, setSaving] = useState(false);

  const anySet = Object.values(values).some((v) => v.trim() !== "");

  async function save() {
    setSaving(true);
    try {
      const cleaned: Record<string, number> = {};
      for (const [category, raw] of Object.entries(values)) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n <= 0) continue;
        cleaned[category] = Math.round(n * 100) / 100;
      }
      await apiSend("/api/settings", "PATCH", { expenseBudgets: cleaned });
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save budgets");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="farm-scroll max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="size-4 text-primary" aria-hidden />
            Monthly budgets
          </DialogTitle>
          <DialogDescription>
            Set a kwacha limit per category for each month. Leave a field empty for categories you
            do not want to track. Saved to this device first, synced later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EXPENSE_CATEGORIES.map((category) => (
            <div key={category} className="flex flex-col gap-1">
              <Label htmlFor={`budget-${category}`} className="text-xs font-medium">
                {titleCase(category)}
              </Label>
              <Input
                id={`budget-${category}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={50}
                placeholder="—"
                value={values[category]}
                onChange={(e) => setValues((v) => ({ ...v, [category]: e.target.value }))}
                className="min-h-11 tabular-nums"
                autoComplete="off"
              />
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="min-h-11" disabled={saving || !anySet} onClick={() => setValues({})}>
            Clear all
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button className="min-h-11" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save budgets"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
