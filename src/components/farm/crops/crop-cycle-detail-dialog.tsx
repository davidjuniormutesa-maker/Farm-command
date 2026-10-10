"use client";

import { useState } from "react";
import {
  CalendarDays,
  Droplets,
  MapPin,
  NotebookPen,
  Package,
  Ruler,
  Scissors,
  Sprout,
} from "lucide-react";
import {
  daysUntil,
  formatDate,
  formatDateShort,
  formatKwacha,
  statusBadgeClass,
  titleCase,
} from "@/lib/farm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ActivityTimeline } from "./activity-timeline";
import { LogActivityDialog } from "./log-activity-dialog";
import { harvestCountdown } from "./shared";
import type { CropCycleWithField } from "./types";

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  );
}

/** Full crop-cycle info + its activity timeline + quick "Log activity". */
export function CropCycleDetailDialog({
  cycle,
  onOpenChange,
}: {
  cycle: CropCycleWithField;
  onOpenChange: (open: boolean) => void;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const countdown = harvestCountdown(cycle);
  const contextLabel = cycle.crop + (cycle.field ? ` — ${cycle.field.name}` : "");

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
              <Sprout className="size-5 text-primary" aria-hidden />
              {cycle.crop}
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(cycle.status)}`}>
                {titleCase(cycle.status)}
              </span>
            </DialogTitle>
            <DialogDescription>
              {cycle.variety ? `${cycle.variety} · ` : ""}
              Full cycle record and activity log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* --- Details --- */}
            <div className="space-y-2.5">
              <InfoRow icon={MapPin} label="Field" value={cycle.field?.name ?? "No field"} />
              <InfoRow
                icon={CalendarDays}
                label="Timeline"
                value={`${formatDateShort(cycle.plantingDate)} → ${formatDateShort(cycle.expectedHarvestDate)}`}
              />
              {countdown && (
                <InfoRow
                  icon={Ruler}
                  label="Countdown"
                  value={
                    <span className={countdown.tone === "late" ? "text-destructive" : countdown.tone === "warn" ? "text-gold-foreground dark:text-gold" : "text-emerald-700 dark:text-emerald-400"}>
                      {countdown.text}
                    </span>
                  }
                />
              )}
              <InfoRow icon={Droplets} label="Seed / inputs" value={cycle.seedDetails ?? "—"} />
              {cycle.status === "harvested" && (
                <>
                  <InfoRow
                    icon={Scissors}
                    label="Harvested"
                    value={
                      <>
                        {formatDate(cycle.actualHarvestDate)} — {cycle.harvestQuantity ?? "—"}{" "}
                        {cycle.harvestUnit ?? ""}
                      </>
                    }
                  />
                  <InfoRow
                    icon={Package}
                    label="Sale"
                    value={cycle.saleAmount != null ? formatKwacha(cycle.saleAmount) : "Not sold / not recorded"}
                  />
                </>
              )}
              {cycle.status === "growing" && cycle.expectedHarvestDate && (
                <InfoRow
                  icon={Ruler}
                  label="Expected"
                  value={
                    daysUntil(cycle.expectedHarvestDate) !== null
                      ? `${formatDate(cycle.expectedHarvestDate)}`
                      : "—"
                  }
                />
              )}
              {cycle.notes && <InfoRow icon={NotebookPen} label="Notes" value={cycle.notes} />}
            </div>

            <Separator />

            {/* --- Activity log --- */}
            <section aria-label="Crop cycle activity log" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Activity log</h3>
                <Button variant="outline" size="sm" className="min-h-11 gap-1.5" onClick={() => setLogOpen(true)}>
                  <NotebookPen className="size-4" aria-hidden />
                  Log activity
                </Button>
              </div>
              <ActivityTimeline
                filter={{ cropCycleId: cycle.id }}
                emptyHint="No activities logged for this crop yet — planting, spraying and scouting records will appear here."
              />
            </section>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sprout className="size-3" aria-hidden />
              {cycle.field?.name ?? "No field"}
            </Badge>
          </div>
        </DialogContent>
      </Dialog>

      <LogActivityDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        key={String(logOpen)}
        context={{ cropCycleId: cycle.id, fieldId: cycle.fieldId }}
        contextLabel={contextLabel}
      />
    </>
  );
}
