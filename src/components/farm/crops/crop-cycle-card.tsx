"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, MapPin, Pencil, Scissors, Sprout, Trash2 } from "lucide-react";
import { apiSend } from "@/lib/api";
import { formatDateShort, formatKwacha, statusBadgeClass, titleCase } from "@/lib/farm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDeleteDialog, harvestCountdown } from "./shared";
import type { CropCycleWithField } from "./types";

/** Crop cycle card: identity, dates, countdown / harvest summary and actions. */
export function CropCycleCard({
  cycle,
  onOpen,
  onEdit,
  onRecordHarvest,
}: {
  cycle: CropCycleWithField;
  onOpen: (cycle: CropCycleWithField) => void;
  onEdit: (cycle: CropCycleWithField) => void;
  onRecordHarvest: (cycle: CropCycleWithField) => void;
}) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => apiSend(`/api/crops/${cycle.id}`, "DELETE"),
    onSuccess: () => {
      toast.success(`${cycle.crop} cycle deleted.`);
      setConfirmOpen(false);
      for (const key of [["fields"], ["crops"], ["activities"], ["summary"], ["dashboard"]] as const) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err) => {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not delete the crop cycle.");
    },
  });

  const countdown = harvestCountdown(cycle);
  const canHarvest = cycle.status === "growing" || cycle.status === "planned";

  return (
    <Card
      className="cursor-pointer gap-3 rounded-xl p-4 transition-shadow hover:shadow-md"
      onClick={() => onOpen(cycle)}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="min-w-0 text-left focus-visible:outline-2"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(cycle);
          }}
        >
          <span className="flex items-center gap-2 text-base font-semibold leading-tight hover:underline">
            <Sprout className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{cycle.crop}</span>
          </span>
          {cycle.variety && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{cycle.variety}</span>}
        </button>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(cycle.status)}`}>
          {titleCase(cycle.status)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="max-w-full gap-1 font-normal">
          <MapPin className="size-3 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{cycle.field?.name ?? "No field"}</span>
        </Badge>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0 text-primary" aria-hidden />
          {formatDateShort(cycle.plantingDate)} → {formatDateShort(cycle.expectedHarvestDate)}
        </p>

        {countdown && (
          <p
            className={`text-sm font-medium ${
              countdown.tone === "late"
                ? "text-destructive"
                : countdown.tone === "warn"
                  ? "text-gold-foreground dark:text-gold"
                  : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            ⏳ {countdown.text}
          </p>
        )}

        {cycle.status === "harvested" && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <Scissors className="size-3.5 shrink-0 text-gold-foreground dark:text-gold" aria-hidden />
            <span className="font-medium text-foreground">
              {cycle.harvestQuantity ?? "—"} {cycle.harvestUnit ?? ""}
            </span>
            {cycle.saleAmount != null && (
              <span className="text-gold-foreground dark:text-gold">· Sold {formatKwacha(cycle.saleAmount)}</span>
            )}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1 border-t pt-2">
        {canHarvest && (
          <Button
            size="sm"
            className="mr-auto h-10 min-h-11 gap-1.5 px-3"
            onClick={(e) => {
              e.stopPropagation();
              onRecordHarvest(cycle);
            }}
          >
            <Scissors className="size-4" aria-hidden />
            Record harvest
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-10 gap-1.5 px-3"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(cycle);
          }}
          aria-label={`Edit ${cycle.crop} cycle`}
        >
          <Pencil className="size-4" aria-hidden />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 gap-1.5 px-3 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          aria-label={`Delete ${cycle.crop} cycle`}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </Button>
      </div>

      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete the ${cycle.crop} cycle?`}
        description="The crop cycle will be removed. Activities, tasks and transactions that were linked to it are kept."
        onConfirm={() => deleteMutation.mutate()}
      />
    </Card>
  );
}
