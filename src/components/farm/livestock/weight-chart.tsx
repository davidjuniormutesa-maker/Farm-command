"use client";

/**
 * WeightChart — small inline SVG growth chart for an animal's weight history.
 * Task r3 (chart) · Task r4 (target-weight goal line).
 * Farm design language: emerald line, harvest-gold gradient area, dashed gold
 * target line, native <title> tooltips (offline-safe, no chart lib needed).
 */

import { Target } from "lucide-react";
import { formatDotw, formatDateShort } from "./weight-format";

export interface WeightPoint {
  id: string;
  weightKg: number;
  recordedAt: string;
  note?: string | null;
}

interface WeightChartProps {
  records: WeightPoint[];
  /** Accessible one-line summary rendered as sr-only text. */
  label: string;
  /** Optional growth/market goal (kg) — drawn as a dashed gold line. */
  targetKg?: number | null;
}

const W = 560;
const H = 150;
const PAD = { top: 18, right: 16, bottom: 22, left: 40 };

export default function WeightChart({ records, label, targetKg }: WeightChartProps) {
  if (records.length === 0) return null;

  const first = records[0];
  const last = records[records.length - 1];
  const goal = typeof targetKg === "number" && targetKg > 0 ? targetKg : null;

  // ---- Scales (include the goal line in the domain so it's always visible) ----
  const weights = records.map((r) => r.weightKg);
  if (goal) weights.push(goal);
  const rawMin = Math.min(...weights);
  const rawMax = Math.max(...weights);
  const span = Math.max(rawMax - rawMin, 1);
  const yMin = rawMin - span * 0.18;
  const yMax = rawMax + span * 0.18;
  const times = records.map((r) => Date.parse(r.recordedAt));
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const tSpan = Math.max(tMax - tMin, 1);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (t: number) => PAD.left + ((t - tMin) / tSpan) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const points = records.map((r) => ({ ...r, cx: x(Date.parse(r.recordedAt)), cy: y(r.weightKg) }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].cx.toFixed(1)},${(H - PAD.bottom).toFixed(1)} L${points[0].cx.toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;

  // Delta stats
  const totalDelta = last.weightKg - first.weightKg;
  const lastDelta = records.length > 1 ? last.weightKg - records[records.length - 2].weightKg : 0;

  // Goal progress (only meaningful while below target)
  const remaining = goal != null ? Number((goal - last.weightKg).toFixed(1)) : null;
  const goalPct =
    goal != null && remaining != null
      ? Math.max(0, Math.min(100, Math.round(((last.weightKg - first.weightKg) / (goal - first.weightKg)) * 100)))
      : null;

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          {first.weightKg} kg
          <span aria-hidden>→</span>
          <span className="rounded bg-primary/10 px-1 font-semibold text-primary dark:bg-primary/20">{last.weightKg} kg</span>
        </span>
        <span className="sr-only">{label}</span>
        {records.length > 1 && totalDelta !== 0 && (
          <span className={totalDelta > 0 ? "font-medium text-emerald-700 dark:text-emerald-400" : "font-medium text-red-700 dark:text-red-400"}>
            {totalDelta > 0 ? "▲" : "▼"} {Math.abs(totalDelta).toLocaleString()} kg overall
          </span>
        )}
        {records.length > 1 && lastDelta !== 0 && (
          <span className={lastDelta > 0 ? "text-emerald-600 dark:text-emerald-400/80" : "text-red-600 dark:text-red-400/80"}>
            last change {lastDelta > 0 ? "+" : "−"}
            {Math.abs(lastDelta).toLocaleString()} kg
          </span>
        )}
        {goal != null && remaining != null && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${
              remaining <= 0
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            }`}
          >
            <Target className="size-3" aria-hidden />
            {remaining <= 0
              ? `goal reached${goalPct != null && goalPct > 100 ? ` (${goalPct}%)` : ""}`
              : `${remaining.toLocaleString()} kg to goal`}
          </span>
        )}
        <span className="ml-auto hidden sm:inline">tap a point for details</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id="weightAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold, #d97706)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--gold, #d97706)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* horizontal gridlines: min / mid / max */}
        {[yMin, (yMin + yMax) / 2, yMax].map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth="1" strokeDasharray={i === 1 ? "3 4" : undefined} />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* area + line */}
        <path d={areaPath} fill="url(#weightAreaFill)" />
        <path d={linePath} fill="none" className="stroke-primary" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />

        {/* target-weight goal line */}
        {goal != null && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(goal)}
              y2={y(goal)}
              stroke="var(--gold, #d97706)"
              strokeWidth="1.75"
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
            <g transform={`translate(${W - PAD.right - 4}, ${y(goal) - 5})`} textAnchor="end">
              <text className="fill-amber-700 text-[9px] font-semibold dark:fill-amber-400">
                target {goal} kg
              </text>
            </g>
            <title>{`Target weight: ${goal} kg`}</title>
          </g>
        )}

        {/* points with native tooltips */}
        {points.map((p, i) => (
          <g key={p.id}>
            <circle
              cx={p.cx}
              cy={p.cy}
              r={i === points.length - 1 ? 4.5 : 3}
              className={i === points.length - 1 ? "fill-primary" : "fill-background"}
              stroke="var(--primary, #16a34a)"
              strokeWidth="2"
            />
            <title>
              {`${formatDotw(p.recordedAt)} · ${p.weightKg} kg${p.note ? ` — ${p.note}` : ""}`}
            </title>
          </g>
        ))}

        {/* x-axis end labels */}
        <text x={PAD.left} y={H - 6} className="fill-muted-foreground text-[9px]">{formatDateShort(first.recordedAt)}</text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-muted-foreground text-[9px]">{formatDateShort(last.recordedAt)}</text>
      </svg>
    </div>
  );
}
