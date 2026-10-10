"use client";

/**
 * WeightGainReport — herd growth performance section (Task r4).
 * Per-animal weight change over the trailing window with average daily gain,
 * target progress bars, and honest sourcing notes (recorded weigh-ins only).
 */

import { TrendingDown, TrendingUp, Target } from "lucide-react";
import { ReportCard, StatTile } from "./report-card";
import type { WeightGainRow } from "./report-types";

function dateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function WeightGainReport({
  windowDays,
  rows,
  gaining,
  losing,
  herdAvgAdg,
}: {
  windowDays: number;
  rows: WeightGainRow[];
  gaining: number;
  losing: number;
  herdAvgAdg: number;
}) {
  const maxAbsGain = Math.max(...rows.map((r) => Math.abs(r.gainKg)), 1);

  return (
    <ReportCard
      title="Weight gain & growth"
      description={`Weight change per animal over the last ${windowDays} days — from recorded weigh-ins.`}
    >
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Not enough weigh-ins yet — record at least two weights per animal in Livestock to see
          growth performance here.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Herd-level stats */}
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Gaining" value={gaining} tone="good" />
            <StatTile label="Losing weight" value={losing} tone={losing > 0 ? "bad" : "neutral"} />
            <StatTile label="Herd avg daily gain" value={`${herdAvgAdg.toFixed(2)} kg/day`} tone="gold" />
          </div>

          {/* Per-animal rows */}
          <ul className="space-y-2" aria-label="Weight change by animal">
            {rows.map((r) => {
              const positive = r.gainKg > 0;
              const zero = r.gainKg === 0;
              const barPct = Math.max(4, Math.round((Math.abs(r.gainKg) / maxAbsGain) * 100));
              const targetPct =
                r.targetKg != null && r.targetKg > r.fromKg
                  ? Math.min(100, Math.round(((r.currentKg - r.fromKg) / (r.targetKg - r.fromKg)) * 100))
                  : null;
              return (
                <li
                  key={r.animalId}
                  className="rounded-lg border bg-background px-3 py-2.5"
                  aria-label={`${r.label}: ${r.gainKg > 0 ? "gained" : r.gainKg < 0 ? "lost" : "no change of"} ${Math.abs(r.gainKg)} kilograms over ${r.days} days`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {dateShort(r.fromDate)} → {dateShort(r.toDate)} · {r.days}d
                      {r.approx && " (older weigh-ins)"}
                    </span>
                    <span
                      className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                        zero
                          ? "bg-muted text-muted-foreground"
                          : positive
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300"
                      }`}
                    >
                      {positive ? (
                        <TrendingUp className="size-3" aria-hidden />
                      ) : zero ? (
                        <span aria-hidden>→</span>
                      ) : (
                        <TrendingDown className="size-3" aria-hidden />
                      )}
                      {positive ? "+" : r.gainKg < 0 ? "−" : ""}
                      {Math.abs(r.gainKg).toLocaleString()} kg
                    </span>
                  </div>

                  {/* Gain bar */}
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                    aria-hidden
                  >
                    <div
                      className={`h-full rounded-full ${zero ? "bg-muted-foreground/40" : positive ? "bg-emerald-500" : "bg-red-400"}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {r.fromKg.toLocaleString()} → {r.currentKg.toLocaleString()} kg
                    </span>
                    <span className="tabular-nums">
                      {r.adgKg >= 0 ? "+" : "−"}
                      {Math.abs(r.adgKg).toFixed(2)} kg/day
                    </span>
                    {r.targetKg != null && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Target className="size-3 text-amber-600 dark:text-amber-400" aria-hidden />
                        {r.currentKg >= r.targetKg
                          ? `target ${r.targetKg.toLocaleString()} kg reached`
                          : `${(r.targetKg - r.currentKg).toLocaleString()} kg to target`}
                      </span>
                    )}
                  </div>

                  {/* Target progress */}
                  {targetPct != null && (
                    <div
                      className="mt-1 h-1 overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-900/40"
                      aria-hidden
                    >
                      <div
                        className={`h-full rounded-full ${r.currentKg >= (r.targetKg ?? 0) ? "bg-emerald-500" : "bg-amber-500"}`}
                        style={{ width: `${targetPct}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Daily gain is a guide — animals weighed at home on a yard scale vary day to day. Weight
            loss can signal illness, worms or poor feed; check the herd and consult your local vet
            or extension officer if it persists.
          </p>
        </div>
      )}
    </ReportCard>
  );
}
