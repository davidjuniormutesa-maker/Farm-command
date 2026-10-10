"use client";

/**
 * RainfallReport (r5, seasons added r7-b) — the rain-season picture for Reports.
 * Builds trailing-12-month buckets from the daily gauge readings and
 * highlights the Zambian rainy season (Nov–Apr) in cyan — the same semantic
 * water colour used across the dashboard gauge and calendar chips.
 *
 * r7-b adds a "Seasons (Nov – Apr)" section: client-side aggregates per
 * Zambian rain season (Nov 1 → Apr 30), rendered as a compact horizontal
 * bar chart of season totals with rain-days / wettest-month stat lines.
 */

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, qk } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyStateMessage } from "./empty-state";
import { ReportCard, StatTile } from "./report-card";

interface RainReading {
  id: string;
  date: string;
  mm: number;
  note?: string | null;
}

interface RainfallPayload {
  readings: RainReading[];
  today: number | null;
  last7: number;
  last30: number;
  last12Months: number;
  lastRain: { date: string; mm: number } | null;
}

/** Zambia's rainy season: November through April. */
const RAINY_MONTHS = new Set([10, 11, 0, 1, 2, 3]);
const RAIN_FILL = "var(--chart-4)";
const SEASON_FILL = "var(--chart-1)";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Calendar order of the months inside one season (Nov → Apr). */
const SEASON_MONTH_ORDER = [10, 11, 0, 1, 2, 3];

interface MonthBucket {
  key: string;
  label: string;
  mm: number;
  rainy: boolean;
}

interface SeasonAgg {
  /** Year the season starts in (Nov of this year → Apr of the next). */
  startYear: number;
  /** "2025/26" style label. */
  label: string;
  totalMm: number;
  rainDays: number;
  wettest: { label: string; mm: number } | null;
  comparison: string;
  comparisonTone: "good" | "warn" | "muted";
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function buildBuckets(readings: RainReading[]): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      mm: 0,
      rainy: RAINY_MONTHS.has(d.getMonth()),
    });
  }
  const index = new Map(buckets.map((b, idx) => [b.key, idx]));
  for (const r of readings) {
    const d = new Date(r.date);
    if (Number.isNaN(d.getTime())) continue;
    const idx = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (idx != null) buckets[idx].mm = round1(buckets[idx].mm + r.mm);
  }
  return buckets;
}

/** Season start-year for a reading date: Nov/Dec → this year, Jan–Apr → the year before. May–Oct is the dry gap between seasons. */
function seasonStartYear(d: Date): number | null {
  const m = d.getMonth();
  if (m >= 10) return d.getFullYear();
  if (m <= 3) return d.getFullYear() - 1;
  return null;
}

function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * Aggregate gauge readings into rain seasons (Nov Y → Apr Y+1), most recent
 * first, at most 6. Comparison is always against the previous season when it
 * has data — even if that season fell outside the 6-season window.
 */
function buildSeasons(readings: RainReading[], max = 6): SeasonAgg[] {
  const acc = new Map<number, { total: number; rainDays: number; byMonth: Map<number, number> }>();
  for (const r of readings) {
    const d = new Date(r.date);
    if (Number.isNaN(d.getTime())) continue;
    const y = seasonStartYear(d);
    if (y == null) continue;
    let a = acc.get(y);
    if (!a) {
      a = { total: 0, rainDays: 0, byMonth: new Map() };
      acc.set(y, a);
    }
    a.total += r.mm;
    if (r.mm > 0) a.rainDays += 1;
    a.byMonth.set(d.getMonth(), (a.byMonth.get(d.getMonth()) ?? 0) + r.mm);
  }

  const years = [...acc.keys()].sort((a, b) => b - a);
  return years.slice(0, max).map((y) => {
    const a = acc.get(y)!;
    let wettest: SeasonAgg["wettest"] = null;
    for (const m of SEASON_MONTH_ORDER) {
      const mm = a.byMonth.get(m) ?? 0;
      if (mm > 0 && (!wettest || mm > wettest.mm)) wettest = { label: MONTH_NAMES[m], mm: round1(mm) };
    }
    const prev = acc.get(y - 1);
    let comparison = "first season";
    let comparisonTone: SeasonAgg["comparisonTone"] = "muted";
    if (prev && prev.total > 0) {
      const pct = Math.round(((a.total - prev.total) / prev.total) * 100);
      if (pct >= 0) {
        comparison = `+${pct}%`;
        comparisonTone = "good";
      } else {
        comparison = `−${Math.abs(pct)}%`;
        comparisonTone = "warn";
      }
    } else if (prev) {
      comparison = "prior season dry";
    }
    return {
      startYear: y,
      label: seasonLabel(y),
      totalMm: round1(a.total),
      rainDays: a.rainDays,
      wettest,
      comparison,
      comparisonTone,
    };
  });
}

/** Nov 1 (this or last year) → Apr 30 — the season window around today. */
function seasonRange(now: Date) {
  const startYear = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: new Date(startYear, 10, 1),
    end: new Date(startYear + 1, 3, 30, 23, 59, 59),
  };
}

export function RainfallReport() {
  const { data, isLoading } = useQuery({
    queryKey: qk.rainfall,
    queryFn: () => apiGet<RainfallPayload>("/api/rainfall"),
  });

  const readings = data?.readings ?? [];
  const buckets = buildBuckets(readings);
  const seasons = buildSeasons(readings);
  // Oldest season first so the chart stacks newest on top (verified r7-b).
  const seasonChart = [...seasons].reverse();
  const now = new Date();
  const { start, end } = seasonRange(now);
  const seasonToDate = round1(
    readings
      .filter((r) => {
        const d = new Date(r.date);
        return !Number.isNaN(d.getTime()) && d >= start && d <= end;
      })
      .reduce((s, r) => s + r.mm, 0),
  );
  const inSeasonNow = RAINY_MONTHS.has(now.getMonth());
  const wettest = buckets.reduce(
    (best, b) => (b.mm > (best?.mm ?? 0) ? b : best),
    null as MonthBucket | null,
  );
  const seasonChartHeight = Math.max(seasonChart.length * 40 + 16, 72);
  const seasonMax = Math.max(...seasonChart.map((s) => s.totalMm), 10);

  return (
    <ReportCard
      title="Rain gauge"
      description="Daily gauge readings per month, trailing 12 months — cyan marks the Nov–Apr rainy season"
    >
      {isLoading ? (
        <Skeleton className="h-[240px] w-full rounded-lg" />
      ) : (
        <>
          {readings.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <StatTile label={inSeasonNow ? "This season so far" : "Last season (Nov–Apr)"} value={`${seasonToDate} mm`} />
                <StatTile label="Trailing 12 months" value={`${round1(data?.last12Months ?? 0)} mm`} />
                <StatTile
                  label="Wettest month"
                  value={wettest && wettest.mm > 0 ? `${wettest.label} · ${wettest.mm} mm` : "—"}
                />
              </div>

              <div className="mt-3 h-[200px] w-full">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    />
                    <YAxis
                      width={38}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      tickFormatter={(v: number) => `${v}`}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--accent)", opacity: 0.5 }}
                      formatter={(value: number | string) => [`${value} mm`, "Rainfall"]}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Bar dataKey="mm" radius={[4, 4, 0, 0]} maxBarSize={26}>
                      {buckets.map((b) => (
                        <Cell
                          key={b.key}
                          fill={b.rainy ? RAIN_FILL : "var(--muted-foreground)"}
                          fillOpacity={b.rainy ? 1 : 0.35}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                Only days you logged are counted — the gauge is only as good as its keeper.
              </p>
            </>
          )}

          {/* Seasons (Nov–Apr) — r7-b: totals per Zambian rain season, computed client-side */}
          <div className={readings.length > 0 ? "mt-5 border-t pt-4" : ""}>
            <h4 className="text-sm font-semibold tracking-tight">Seasons (Nov – Apr)</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Season totals from your gauge — November to April, newest first
            </p>
            {seasons.length === 0 ? (
              <EmptyStateMessage message="No rainfall readings yet — log daily rain in season view to build history." />
            ) : (
              <div className="mt-3">
                <div className="w-full" style={{ height: seasonChartHeight }}>
                  <ResponsiveContainer width="100%" height={seasonChartHeight}>
                    <BarChart
                      data={seasonChart}
                      layout="vertical"
                      margin={{ top: 4, right: 52, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" hide domain={[0, Math.ceil(seasonMax * 1.3)]} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={58}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--accent)", opacity: 0.5 }}
                        formatter={(value: number | string) => [`${value} mm`, "Season total"]}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Bar dataKey="totalMm" fill={SEASON_FILL} radius={[0, 4, 4, 0]} maxBarSize={20}>
                        <LabelList
                          dataKey="totalMm"
                          position="right"
                          formatter={(value: number) => `${value} mm`}
                          style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <ul className="mt-2 space-y-1">
                  {seasons.map((s) => (
                    <li key={s.startYear} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[13px] font-medium tabular-nums">{s.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.rainDays} {s.rainDays === 1 ? "rain day" : "rain days"}
                        {s.wettest ? ` · wettest ${s.wettest.label} (${s.wettest.mm} mm)` : ""}
                      </span>
                      <span
                        className={`ml-auto text-xs font-medium tabular-nums ${
                          s.comparisonTone === "good"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : s.comparisonTone === "warn"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-muted-foreground"
                        }`}
                      >
                        {s.comparison}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </ReportCard>
  );
}
