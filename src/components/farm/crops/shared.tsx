"use client";

import type { LucideIcon } from "lucide-react";
import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/api";
import { daysUntil } from "@/lib/farm";
import type { CropCycleDTO } from "@/lib/farm";
import { Button } from "@/components/ui/button";
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

/** Invalidate every query a crops/fields/activities mutation can affect. */
export function invalidateFarmData(qc: QueryClient): void {
  for (const key of [qk.fields, qk.crops, qk.activities, qk.finance, qk.summary, qk.dashboard]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

/** "2" → "2 ha", "1.75" → "1.75 ha" */
export function formatHa(areaHa: number | null | undefined): string {
  if (typeof areaHa !== "number" || !isFinite(areaHa)) return "—";
  return `${areaHa.toLocaleString("en-ZM", { maximumFractionDigits: 2 })} ha`;
}

export interface HarvestCountdown {
  text: string;
  tone: "ok" | "warn" | "late";
}

/** Countdown label for a growing crop cycle. */
export function harvestCountdown(cycle: Pick<CropCycleDTO, "status" | "expectedHarvestDate">): HarvestCountdown | null {
  if (cycle.status !== "growing" || !cycle.expectedHarvestDate) return null;
  const days = daysUntil(cycle.expectedHarvestDate);
  if (days === null) return null;
  if (days === 0) return { text: "Expected to be ready for harvest today", tone: "warn" };
  if (days > 0) return { text: `~${days} days to expected harvest`, tone: "ok" };
  return { text: `${Math.abs(days)} days past expected harvest`, tone: "late" };
}

/** Emoji shown next to each activity type in selects and timelines. */
export const ACTIVITY_TYPE_EMOJI: Record<string, string> = {
  planting: "🌱",
  fertilizer: "🧪",
  spraying: "🚿",
  irrigation: "💧",
  weeding: "🌿",
  scouting: "🔍",
  harvesting: "🌾",
  equipment: "🛠️",
  fencing: "🚧",
  feeding: "🐄",
  water: "🪣",
  transport: "🚛",
  other: "📝",
};

/** Empty-state panel: icon + explanation + call to action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10" aria-hidden>
        <Icon className="size-7 text-primary" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-1 min-h-11" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

/** Confirmation dialog for destructive deletes. */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive"
            onClick={onConfirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
