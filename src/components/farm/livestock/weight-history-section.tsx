"use client";

/**
 * WeightHistorySection — weight card inside AnimalDetailDialog (Task r3).
 * Growth chart + record/delete actions + recent measurements list.
 * Data: GET /api/animals/[id]/weights, keyed under the animal's query cache.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Scale, Target, Trash2 } from "lucide-react";
import { apiGet, apiSend, qk } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnimalWithGroup } from "./livestock-helpers";
import WeightChart, { type WeightPoint } from "./weight-chart";
import { formatDotw } from "./weight-format";
import WeightRecordDialog from "./weight-record-dialog";

interface WeightHistorySectionProps {
  animal: AnimalWithGroup;
}

interface WeightsResponse {
  animal: { id: string; tagId: string; name: string | null; weightKg: number | null };
  records: WeightPoint[];
}

export default function WeightHistorySection({ animal }: WeightHistorySectionProps) {
  const queryClient = useQueryClient();
  const [recordOpen, setRecordOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const weightsKey = [...qk.animals, animal.id, "weights"];
  const { data, isLoading } = useQuery({
    queryKey: weightsKey,
    queryFn: () => apiGet<WeightsResponse>(`/api/animals/${animal.id}/weights`),
  });

  const invalidate = () => {
    for (const key of [qk.animals, qk.groups, qk.summary, qk.dashboard, qk.livestock]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    queryClient.invalidateQueries({ queryKey: weightsKey });
  };

  const remove = async (recordId: string) => {
    setDeletingId(recordId);
    try {
      await apiSend(`/api/animals/${animal.id}/weights/${recordId}`, "DELETE");
      toast.success("Weight record deleted");
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the record");
    } finally {
      setDeletingId(null);
    }
  };

  const records = data?.records ?? [];
  // Newest first for the list
  const newestFirst = [...records].reverse();
  const label = animal.name ? `${animal.tagId} · ${animal.name}` : animal.tagId;
  const goal = typeof animal.targetWeightKg === "number" && animal.targetWeightKg > 0 ? animal.targetWeightKg : null;

  return (
    <section aria-label="Weight history" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
          <Scale className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
          Weight history
        </h3>
        <Button variant="outline" size="sm" className="min-h-9 gap-1" onClick={() => setRecordOpen(true)}>
          <Plus className="size-3.5" aria-hidden />
          Record
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-[120px] w-full" />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-6 text-center">
          <Scale className="size-5 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-medium">No weights recorded yet</p>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            Weigh {animal.name || animal.tagId} regularly — the growth chart appears here and the newest
            measurement becomes the current weight.
          </p>
          <Button variant="outline" size="sm" className="mt-1.5 min-h-9 gap-1" onClick={() => setRecordOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            Record first weight
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <WeightChart
            records={records}
            targetKg={animal.targetWeightKg}
            label={`Weight history for ${label}: ${records.length} measurements from ${records[0].weightKg} kg to ${records[records.length - 1].weightKg} kg`}
          />

          {goal && records.length > 0 && (
            <GoalProgress
              current={records[records.length - 1].weightKg}
              start={records[0].weightKg}
              target={goal}
            />
          )}

          {/* Recent measurements (newest first, scrollable when long) */}
          <ul className="farm-scroll max-h-40 space-y-1.5 overflow-y-auto pr-1" aria-label="Recent measurements">
            {newestFirst.map((r, i) => {
              const prev = newestFirst[i + 1];
              const delta = prev ? r.weightKg - prev.weightKg : 0;
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-lg border bg-muted/20 px-2.5 py-1.5 text-xs"
                >
                  <span className="w-24 shrink-0 font-medium">{formatDotw(r.recordedAt).replace(/^\w+, /, "")}</span>
                  <span className="font-semibold tabular-nums">{r.weightKg.toLocaleString()} kg</span>
                  {prev && delta !== 0 && (
                    <span className={`tabular-nums ${delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      ({delta > 0 ? "+" : "−"}
                      {Math.abs(delta).toLocaleString()})
                    </span>
                  )}
                  {r.note && <span className="truncate text-muted-foreground" title={r.note}>— {r.note}</span>}
                  <button
                    type="button"
                    className="ml-auto rounded p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-destructive"
                    aria-label={`Delete weight record of ${r.weightKg} kg on ${formatDotw(r.recordedAt)}`}
                    onClick={() => remove(r.id)}
                    disabled={deletingId === r.id}
                  >
                    {deletingId === r.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-3.5" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {recordOpen && (
        <WeightRecordDialog
          animalId={animal.id}
          animalLabel={label}
          currentWeightKg={animal.weightKg}
          onClose={() => setRecordOpen(false)}
          onSaved={invalidate}
        />
      )}
    </section>
  );
}

/** Slim progress bar toward the animal's target weight (r4). */
function GoalProgress({ current, start, target }: { current: number; start: number; target: number }) {
  const pct =
    target > start
      ? Math.max(0, Math.min(100, Math.round(((current - start) / (target - start)) * 100)))
      : current >= target
        ? 100
        : 0;
  const reached = current >= target;
  const remaining = Number((target - current).toFixed(1));
  return (
    <div
      className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/30"
      role="status"
      aria-label={`Goal progress: ${current} of ${target} kilograms, ${pct} percent`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
        <Target className="size-3.5" aria-hidden />
        Goal {current.toLocaleString()} / {target.toLocaleString()} kg
        <span className="ml-auto font-semibold">{pct}%</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/50"
        aria-hidden
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            reached ? "bg-emerald-500" : "bg-gradient-to-r from-amber-500 to-amber-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-300/80">
        {reached
          ? "Goal reached — time to consider selling or adjusting the target."
          : `${Math.abs(remaining).toLocaleString()} kg to go · about ${etaLabel(Math.abs(remaining))} at a typical 0.6 kg/day gain`}
      </p>
    </div>
  );
}

/** Humanise a days-of-gain estimate: days under ~10 weeks, months beyond. */
function etaLabel(kgRemaining: number): string {
  const days = Math.ceil(kgRemaining / 0.6);
  if (days <= 70) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.round(days / 30.4);
  return `${months} ${months === 1 ? "month" : "months"}`;
}
