"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, qk } from "@/lib/api";
import { toast } from "sonner";
import {
  ChevronDown,
  ClipboardList,
  Download,
  FileJson,
  Printer,
  RefreshCw,
} from "lucide-react";
import { ActivityReport } from "./activity-report";
import { BreedingReport } from "./breeding-report";
import { CropsReport } from "./crops-report";
import { ExpensePieReport } from "./expense-pie-report";
import { FinanceChartReport } from "./finance-chart-report";
import { HealthReport } from "./health-report";
import { LivestockReport } from "./livestock-report";
import { RainfallReport } from "./rainfall-report";
import { TasksReport } from "./tasks-report";
import { WeightGainReport } from "./weight-gain-report";
import { CSV_TABLES, monthlyIncomeExpense, type ReportFinanceRow, type ReportsPayload } from "./report-types";
import { type FarmSettingsData } from "@/lib/farm";

/** Trigger a same-origin download without leaving the page. */
function triggerDownload(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsView() {
  const reportsQuery = useQuery({
    queryKey: qk.reports,
    queryFn: () => apiGet<ReportsPayload>("/api/reports"),
  });

  // Full transaction list → aggregated client-side into monthly buckets for the chart.
  const financeQuery = useQuery({
    queryKey: [...qk.finance, "all"],
    queryFn: () => apiGet<ReportFinanceRow[]>("/api/finance"),
  });

  // Farm name for the print header (r5).
  const { data: settings } = useQuery({
    queryKey: qk.settings,
    queryFn: () => apiGet<FarmSettingsData>("/api/settings"),
  });

  const monthly = monthlyIncomeExpense(financeQuery.data ?? []);

  function downloadCsv(table: string, label: string) {
    triggerDownload(`/api/backup/csv?table=${encodeURIComponent(table)}`);
    toast.info(`Downloading ${label} CSV…`);
  }

  function downloadJsonBackup() {
    triggerDownload("/api/backup", `farm-command-backup-${todayStamp()}.json`);
    toast.info("Preparing your full JSON backup…");
  }

  const r = reportsQuery.data;

  // Paper stamp (r7-b) — fixed to the render moment, en-GB format for print.
  const generated = new Date();
  const generatedStamp = `Generated ${generated.toLocaleDateString("en-GB")} · ${generated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const identityLine = [settings?.ownerName, settings?.location].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Print-only header (r7-b): farm identity + generation stamp on paper */}
      <div className="hidden print:mb-4 print:block print:border-b print:border-foreground/20 print:pb-3">
        <p className="text-xl font-bold tracking-tight">{settings?.farmName ?? "Farm Command"}</p>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          Farm Command report
        </p>
        {identityLine && <p className="text-xs text-muted-foreground">{identityLine}</p>}
        <p className="text-xs text-muted-foreground">{generatedStamp}</p>
      </div>

      {/* Header + export controls (screen only) */}
      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="size-5" aria-hidden />
            </span>
            Reports
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A picture of the whole farm — print it, download it, or keep it on the wall.
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2 print:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-h-11">
                <Download className="size-4" aria-hidden />
                Download CSV
                <ChevronDown className="size-4 opacity-60" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Choose a table</DropdownMenuLabel>
              {CSV_TABLES.map((t) => (
                <DropdownMenuItem key={t.value} onClick={() => downloadCsv(t.value, t.label)}>
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="min-h-11" onClick={downloadJsonBackup}>
            <FileJson className="size-4" aria-hidden />
            JSON backup
          </Button>
          <Button variant="outline" className="min-h-11" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            Print
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {reportsQuery.isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-56" />
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error state */}
      {reportsQuery.isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              The report could not be built right now. Your data is safe — try again.
            </p>
            <Button variant="outline" className="min-h-11" onClick={() => reportsQuery.refetch()}>
              <RefreshCw className="size-4" aria-hidden />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Report cards */}
      {reportsQuery.isSuccess && r && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LivestockReport
            bySpecies={r.livestock.bySpecies}
            totalActive={r.livestock.totalActive}
            groupsCount={r.livestock.groupsCount}
            recentDeaths={r.livestock.recentDeaths}
          />
          <BreedingReport />
          <HealthReport
            vaccinationsDue30={r.health.vaccinationsDue30}
            overdueVaccinations={r.health.overdueVaccinations}
            last30Events={r.health.last30Events}
          />
          <CropsReport
            activeCycles={r.crops.activeCycles}
            harvestedThisYear={r.crops.harvestedThisYear}
            fieldsCount={r.crops.fieldsCount}
            totalArea={r.crops.totalArea}
          />
          <TasksReport
            completed30={r.tasks.completed30}
            overdue={r.tasks.overdue}
            openTotal={r.tasks.openTotal}
            byCategory={r.tasks.byCategory}
          />
          <FinanceChartReport months={monthly} />
          <ExpensePieReport rows={r.finance.byCategoryExpense} />
          <ActivityReport last30ByType={r.activities.last30ByType} />
          <RainfallReport />
          <WeightGainReport
            windowDays={r.weightGain.windowDays}
            rows={r.weightGain.rows}
            gaining={r.weightGain.gaining}
            losing={r.weightGain.losing}
            herdAvgAdg={r.weightGain.herdAvgAdg}
          />
        </div>
      )}

      {/* Print-only footer (r7-b): small attribution line on paper */}
      <p className="hidden text-xs text-muted-foreground print:mt-8 print:block print:border-t print:border-foreground/20 print:pt-2">
        Generated by Farm Command — {settings?.farmName ?? "Farm Command"}
      </p>
    </div>
  );
}
