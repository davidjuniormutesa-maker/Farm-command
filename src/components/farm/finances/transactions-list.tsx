"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatKwacha } from "@/lib/farm";
import {
  ArrowDownLeft,
  ArrowUpRight,
  MapPin,
  Pencil,
  ReceiptText,
  Sprout,
  Tags,
  Trash2,
  Users,
} from "lucide-react";
import type { FinanceRow } from "./finance-types";

function linkedChip(row: FinanceRow): { icon: typeof MapPin; label: string } | null {
  if (row.animal) {
    return {
      icon: Tags,
      label: row.animal.name ? `${row.animal.tagId} · ${row.animal.name}` : (row.animal.tagId ?? "Animal"),
    };
  }
  if (row.group) return { icon: Users, label: row.group.name ?? "Group" };
  if (row.cropCycle) {
    return { icon: Sprout, label: row.cropCycle.variety ? `${row.cropCycle.crop} · ${row.cropCycle.variety}` : (row.cropCycle.crop ?? "Crop") };
  }
  if (row.field) return { icon: MapPin, label: row.field.name ?? "Field" };
  return null;
}

/** Scrollable transaction register with edit + delete (confirm) actions. */
export function TransactionsList({
  rows,
  isLoading,
  onEdit,
  onDelete,
  deletingId,
  onRecordFirst,
}: {
  rows: FinanceRow[];
  isLoading: boolean;
  onEdit: (row: FinanceRow) => void;
  onDelete: (row: FinanceRow) => void;
  deletingId: string | null;
  onRecordFirst: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<FinanceRow | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Transactions</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ReceiptText className="size-6 text-muted-foreground" aria-hidden />
            </span>
            <div>
              <p className="font-medium">No transactions in this period</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Record a sale or an expense and it will show up here instantly.
              </p>
            </div>
            <Button onClick={onRecordFirst} className="mt-1 min-h-11">
              <ReceiptText className="size-4" aria-hidden />
              Record your first transaction
            </Button>
          </div>
        ) : (
          <ul
            className="farm-scroll max-h-[480px] space-y-1.5 overflow-y-auto pr-1"
            aria-label="Transaction list"
          >
            {rows.map((row) => {
              const income = row.type === "income";
              const Icon = income ? ArrowDownLeft : ArrowUpRight;
              const chip = linkedChip(row);
              return (
                <li
                  key={row.id}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                      income
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                    }`}
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                        {row.category}
                      </Badge>
                      <span>{formatDate(row.date)}</span>
                      {row.paymentMethod && (
                        <span className="hidden sm:inline">· {row.paymentMethod}</span>
                      )}
                      {chip && (
                        <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[11px] font-normal">
                          <chip.icon className="size-3" aria-hidden />
                          {chip.label}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                    <span
                      className={`whitespace-nowrap text-sm font-semibold tabular-nums sm:text-base ${
                        income ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {income ? "+" : "−"} {formatKwacha(row.amount)}
                    </span>
                    <div className="no-print flex items-center opacity-70 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9"
                        aria-label={`Edit ${row.description}`}
                        onClick={() => onEdit(row)}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 text-destructive hover:text-destructive"
                        aria-label={`Delete ${row.description}`}
                        onClick={() => setPendingDelete(row)}
                        disabled={deletingId === row.id}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `"${pendingDelete.description}" (${formatKwacha(pendingDelete.amount)}) will be permanently removed from your records. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
