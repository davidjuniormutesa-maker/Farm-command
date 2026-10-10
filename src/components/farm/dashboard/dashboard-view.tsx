"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CloudOff,
  CloudRain,
  CloudSun,
  Droplets,
  Egg,
  Milk,
  NotebookPen,
  RefreshCcw,
  Sprout,
  Sunrise,
  Tractor,
  Wallet,
  Wind,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiGet, apiSend, qk } from "@/lib/api";
import {
  formatDateShort,
  formatKwacha,
  greetingForHour,
  PRIORITY_LABEL,
  priorityBadgeClass,
  statusBadgeClass,
  titleCase,
  weatherEmoji,
  weatherLabel,
  type FarmSettingsData,
  type RainfallResponseDTO,
  type TaskDTO,
  type WeatherDataDTO,
} from "@/lib/farm";
import { useFarmStore } from "@/components/farm/store";
import RainLogDialog from "@/components/farm/rainfall/rain-log-dialog";
import { LogActivityDialog } from "@/components/farm/crops/log-activity-dialog";
import InstallBanner from "@/components/farm/sync/install-banner";
import { useSyncStore } from "@/lib/offline/sync";

interface DashboardData {
  attention: { overdueTasks: number; dueTodayTasks: number; overdueVaccinations: number; nearingHarvest: number };
  glance: { livestockTotal: number; groupTotal: number; activeCrops: number; fieldsTotal: number; openTasks: number };
  tasks: { overdue: TaskDTO[]; overdueCount: number; dueToday: TaskDTO[]; dueTodayCount: number; upcoming: TaskDTO[] };
  vaccinations: { overdue: VacItem[]; soon: VacItem[] };
  crops: { active: CropItem[]; nearingHarvest: HarvItem[] };
  finances: {
    monthIncome: number;
    monthExpense: number;
    monthNet: number;
    topExpenseCategories: { category: string; total: number; label: string }[];
  };
  recentActivities: { id: string; type: string; title: string; date: string; details: string | null; linkLabel: string | null }[];
  todayISO: string;
}
interface VacItem { id: string; vaccineName: string; target: string; nextDueDate: string; days: number }
interface CropItem { id: string; crop: string; variety: string | null; field: string | null; status: string; expectedHarvestDate: string | null }
interface HarvItem { id: string; crop: string; field: string | null; expectedHarvestDate: string; days: number }

const TASK_PREVIEW_COUNT = 5;
const SIDE_PREVIEW_COUNT = 4;

type QuickActionId =
  | "add-animal"
  | "add-task"
  | "add-transaction"
  | "record-harvest"
  | "log-activity"
  | "log-rainfall";

const QUICK_ACTIONS: { id: QuickActionId; label: string; icon: React.ElementType }[] = [
  { id: "add-animal", label: "Add animal", icon: Milk },
  { id: "add-task", label: "Add task", icon: CalendarCheck },
  { id: "log-activity", label: "Log activity", icon: NotebookPen },
  { id: "add-transaction", label: "Record transaction", icon: Wallet },
  { id: "log-rainfall", label: "Log rainfall", icon: CloudRain },
  { id: "record-harvest", label: "Record harvest", icon: Tractor },
];

export default function DashboardView() {
  const queryClient = useQueryClient();
  const setView = useFarmStore((s) => s.setView);
  const requestQuickAction = useFarmStore((s) => s.requestQuickAction);

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.dashboard,
    queryFn: () => apiGet<DashboardData>("/api/dashboard"),
  });

  const { data: settings } = useQuery({
    queryKey: qk.settings,
    queryFn: () => apiGet<FarmSettingsData>("/api/settings"),
  });

  const {
    data: weather,
    refetch: refetchWeather,
    isFetching: weatherLoading,
    isError: weatherError,
  } = useQuery({
    queryKey: qk.weather,
    queryFn: () => apiGet<WeatherDataDTO>("/api/weather"),
    staleTime: 10 * 60_000,
    retry: false,
  });

  // Server reachability from the sync engine — used to surface the stale-data
  // pill even when the service worker served a *recent* cached forecast.
  const serverReachable = useSyncStore((s) => s.online && !s.lastError && s.pending === 0);
  const weatherMaybeStale = !serverReachable || Boolean(weather?.stale) || Boolean(weather?.cached);

  const { data: rainfall } = useQuery({
    queryKey: qk.rainfall,
    queryFn: () => apiGet<RainfallResponseDTO>("/api/rainfall"),
    staleTime: 60_000,
  });

  const [rainLogOpen, setRainLogOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  // Details section: collapsed by default on mobile, open on desktop.
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    setDetailsOpen(window.matchMedia("(min-width: 1024px)").matches);
  }, []);

  const completeTask = async (task: TaskDTO) => {
    setBusyTaskId(task.id);
    try {
      const res = await apiSend<{ completed: TaskDTO; next?: TaskDTO | null }>(`/api/tasks/${task.id}/complete`, "POST");
      await queryClient.invalidateQueries();
      toast.success(res.next ? `Done — next occurrence scheduled for ${formatDateShort(res.next.dueDate)}` : "Task completed 🎉");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete task");
    } finally {
      setBusyTaskId(null);
    }
  };

  const snoozeTask = async (task: TaskDTO, days: number) => {
    setBusyTaskId(task.id);
    try {
      const res = await apiSend<TaskDTO>(`/api/tasks/${task.id}/snooze`, "POST", { days });
      await queryClient.invalidateQueries();
      toast.success(`Snoozed — now due ${formatDateShort(res.dueDate)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not snooze task");
    } finally {
      setBusyTaskId(null);
    }
  };

  const runQuickAction = (id: QuickActionId) => {
    switch (id) {
      case "log-activity":
        setActivityOpen(true);
        return;
      case "log-rainfall":
        setRainLogOpen(true);
        return;
      case "add-animal":
        setView("livestock");
        requestQuickAction("add-animal");
        return;
      case "add-task":
        setView("tasks");
        requestQuickAction("add-task");
        return;
      case "add-transaction":
        setView("finances");
        requestQuickAction("add-transaction");
        return;
      case "record-harvest":
        setView("crops");
        requestQuickAction("record-harvest");
        return;
    }
  };

  if (isError) {
    return (
      <Card className="mx-auto max-w-lg rounded-xl p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-destructive" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">The dashboard could not load</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your records are safe on this device — check your connection and try again.
        </p>
        <Button className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: qk.dashboard })}>
          Try again
        </Button>
      </Card>
    );
  }

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greeting = greetingForHour(now.getHours());

  const attention = data?.attention;
  const allClear =
    attention !== undefined &&
    attention.overdueTasks === 0 &&
    attention.dueTodayTasks === 0 &&
    attention.overdueVaccinations === 0 &&
    attention.nearingHarvest === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      {/* ============================ 1. TODAY ============================ */}
      <section aria-label="Today" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 space-y-5 lg:col-span-7">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {greeting}{settings?.ownerName ? `, ${settings.ownerName}` : ""}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {dateLabel}
                {settings?.farmName && <span className="hidden sm:inline">· {settings.farmName}</span>}
              </p>
            </div>

            <InstallBanner />

            {isLoading || !data ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatBlock
                  label="Due today"
                  value={data.attention.dueTodayTasks}
                  tone="text-amber-600 dark:text-amber-400"
                  onClick={() => setView("tasks")}
                />
                <StatBlock
                  label="Overdue"
                  value={data.attention.overdueTasks}
                  tone="text-red-600 dark:text-red-400"
                  onClick={() => setView("tasks")}
                />
                <StatBlock
                  label="Vaccinations overdue"
                  value={data.attention.overdueVaccinations}
                  tone="text-red-600 dark:text-red-400"
                  onClick={() => setView("livestock")}
                />
                <StatBlock
                  label="Nearing harvest"
                  value={data.attention.nearingHarvest}
                  tone="text-amber-700 dark:text-amber-300"
                  onClick={() => setView("crops")}
                />
              </div>
            )}
          </div>

          {/* Weather snapshot */}
          <div className="min-w-0 lg:col-span-5">
            <WeatherSnapshot
              weather={weather ?? null}
              loading={weatherLoading && !weather}
              error={weatherError}
              maybeStale={weatherMaybeStale}
              onRefresh={() => refetchWeather()}
              rainSlot={
                <RainGauge rainfall={rainfall ?? null} onLogRain={() => setRainLogOpen(true)} />
              }
            />
          </div>
        </div>
      </section>

      {/* ==================== 2. WHAT NEEDS ATTENTION ==================== */}
      <section aria-label="What needs attention" className="space-y-3">
        <SectionHeading icon={AlertTriangle} title="What needs attention" />
        {isLoading || !data ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : allClear ? (
          <Card className="rounded-xl">
            <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
              <Sunrise className="size-8 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p className="text-lg font-semibold">All clear — nothing overdue right now.</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Well done! Upcoming work will appear here as it becomes due. Enjoy the quiet 🌾
              </p>
              <Button variant="outline" className="mt-2 min-h-11" onClick={() => setView("tasks")}>
                Plan ahead in Tasks <ArrowRight className="size-4" aria-hidden />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Overdue tasks */}
            <ListCard
              title="Overdue tasks"
              icon={AlertTriangle}
              iconClass="text-red-600 dark:text-red-400"
              count={data.tasks.overdueCount}
              countClass="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
              onOpenAll={() => setView("tasks")}
            >
              {data.tasks.overdue.length === 0 ? (
                <EmptyMini text="No overdue tasks — well done! 🎉" />
              ) : (
                <ExpandableList items={data.tasks.overdue} limit={TASK_PREVIEW_COUNT}>
                  {(visible) =>
                    visible.map((t) => (
                      <TaskRowItem
                        key={t.id}
                        task={t}
                        tone="border-l-red-400"
                        busy={busyTaskId === t.id}
                        onComplete={completeTask}
                        onSnooze={snoozeTask}
                      />
                    ))
                  }
                </ExpandableList>
              )}
            </ListCard>

            {/* Due today */}
            <ListCard
              title="Due today"
              icon={CalendarCheck}
              iconClass="text-amber-600 dark:text-amber-400"
              count={data.tasks.dueTodayCount}
              countClass="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              onOpenAll={() => setView("tasks")}
            >
              {data.tasks.dueToday.length === 0 ? (
                <EmptyMini text="Nothing due today — enjoy the quiet 🌾" />
              ) : (
                <ExpandableList items={data.tasks.dueToday} limit={TASK_PREVIEW_COUNT}>
                  {(visible) =>
                    visible.map((t) => (
                      <TaskRowItem
                        key={t.id}
                        task={t}
                        tone="border-l-amber-400"
                        busy={busyTaskId === t.id}
                        onComplete={completeTask}
                      />
                    ))
                  }
                </ExpandableList>
              )}
            </ListCard>

            {/* Overdue vaccinations */}
            <ListCard
              title="Vaccinations overdue"
              icon={BellRing}
              iconClass="text-red-600 dark:text-red-400"
              count={data.attention.overdueVaccinations}
              countClass="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
              onOpenAll={() => setView("livestock")}
            >
              {data.vaccinations.overdue.length === 0 ? (
                <EmptyMini text="No overdue vaccinations — the herd is up to date 💉" />
              ) : (
                <ExpandableList items={data.vaccinations.overdue} limit={SIDE_PREVIEW_COUNT}>
                  {(visible) =>
                    visible.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setView("livestock")}
                        className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-left transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:hover:bg-red-950/60"
                      >
                        <span className="text-lg" aria-hidden>💉</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold sm:text-base">{v.vaccineName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {v.target} · was due {formatDateShort(v.nextDueDate)}
                          </span>
                        </span>
                        <Badge className="shrink-0 border border-red-200 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                          Overdue
                        </Badge>
                      </button>
                    ))
                  }
                </ExpandableList>
              )}
            </ListCard>

            {/* Crops nearing harvest */}
            <ListCard
              title="Crops nearing harvest"
              icon={Sprout}
              iconClass="text-amber-600 dark:text-amber-400"
              count={data.attention.nearingHarvest}
              countClass="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              onOpenAll={() => setView("crops")}
            >
              {data.crops.nearingHarvest.length === 0 ? (
                <EmptyMini text="No crops nearing harvest yet." />
              ) : (
                <ExpandableList items={data.crops.nearingHarvest} limit={SIDE_PREVIEW_COUNT}>
                  {(visible) =>
                    visible.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => setView("crops")}
                        className="flex min-h-11 w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                      >
                        <span className="text-lg" aria-hidden>🌾</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold sm:text-base">{h.crop}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {h.field ?? "No field"} · expected {formatDateShort(h.expectedHarvestDate)}
                          </span>
                        </span>
                        <Badge
                          className={`shrink-0 border ${
                            h.days < 0
                              ? statusBadgeClass("overdue")
                              : h.days === 0
                                ? statusBadgeClass("due_today")
                                : statusBadgeClass("upcoming")
                          }`}
                        >
                          {h.days < 0 ? `${Math.abs(h.days)}d late` : h.days === 0 ? "Today" : `in ${h.days}d`}
                        </Badge>
                      </button>
                    ))
                  }
                </ExpandableList>
              )}
            </ListCard>
          </div>
        )}
      </section>

      {/* ========================= 3. QUICK ACTIONS ======================== */}
      <section aria-label="Quick actions" className="space-y-3">
        <SectionHeading icon={Zap} title="Quick actions" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.id}
              onClick={() => runQuickAction(qa.id)}
              className="flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card p-3 text-center shadow-sm transition-all hover:border-primary/40 hover:bg-accent/40 hover:shadow focus-visible:outline-2 focus-visible:outline-ring sm:min-h-16"
            >
              <qa.icon className="size-5 text-primary" aria-hidden />
              <span className="text-xs font-semibold leading-tight sm:text-sm">{qa.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* =========================== 4. DETAILS =========================== */}
      <section aria-label="Farm details">
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading icon={BookOpen} title="Farm details" className="mb-0" />
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="min-h-11 gap-2 rounded-xl" aria-expanded={detailsOpen}>
                {detailsOpen ? "Hide details" : "Show details"}
                <ChevronDown className={`size-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} aria-hidden />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            {isLoading || !data ? (
              <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* Farm at a glance */}
                <Card className="min-w-0 rounded-xl">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Farm at a glance
                    </h3>
                    <div className="space-y-1.5">
                      <GlanceRow icon={Milk} label="Livestock" sub={`${data.glance.groupTotal} groups`} value={data.glance.livestockTotal} onClick={() => setView("livestock")} />
                      <GlanceRow icon={Sprout} label="Active crops" sub={`${data.glance.fieldsTotal} fields`} value={data.glance.activeCrops} onClick={() => setView("crops")} />
                      <GlanceRow icon={CalendarCheck} label="Open tasks" sub="all time" value={data.glance.openTasks} onClick={() => setView("tasks")} />
                      <GlanceRow icon={Egg} label="Income this month" sub="recorded" value={formatKwacha(data.finances.monthIncome, { compact: true })} onClick={() => setView("finances")} />
                    </div>
                  </CardContent>
                </Card>

                {/* This month */}
                <Card className="min-w-0 rounded-xl">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      This month
                    </h3>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/50 p-2.5">
                        <div className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-xl">
                          {formatKwacha(data.finances.monthIncome, { compact: true })}
                        </div>
                        <div className="text-[11px] text-muted-foreground">income</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2.5">
                        <div className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400 sm:text-xl">
                          {formatKwacha(data.finances.monthExpense, { compact: true })}
                        </div>
                        <div className="text-[11px] text-muted-foreground">expense</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2.5">
                        <div
                          className={`text-lg font-bold tabular-nums sm:text-xl ${
                            data.finances.monthNet >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {formatKwacha(data.finances.monthNet, { compact: true })}
                        </div>
                        <div className="text-[11px] text-muted-foreground">net</div>
                      </div>
                    </div>
                    {data.finances.topExpenseCategories.length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">Top expense categories</p>
                        <TopExpenses categories={data.finances.topExpenseCategories} />
                      </div>
                    )}
                    <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                      Figures reflect recorded entries only — not a full profit statement.
                    </p>
                  </CardContent>
                </Card>

                {/* Recent activity */}
                <Card className="min-w-0 rounded-xl">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Recent activity
                    </h3>
                    {data.recentActivities.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Activity you log will appear here.</p>
                    ) : (
                      <ol className="space-y-3">
                        {data.recentActivities.slice(0, 6).map((a) => (
                          <li key={a.id} className="flex gap-3">
                            <span
                              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs"
                              aria-hidden
                            >
                              {activityEmoji(a.type)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="line-clamp-1 text-sm font-medium">{a.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDateShort(a.date)}
                                {a.linkLabel ? ` · ${a.linkLabel}` : ""}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </section>

      {rainLogOpen && <RainLogDialog onClose={() => setRainLogOpen(false)} />}
      {activityOpen && (
        <LogActivityDialog
          open={activityOpen}
          onOpenChange={(open) => {
            if (!open) setActivityOpen(false);
          }}
          onSaved={() => queryClient.invalidateQueries()}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function SectionHeading({ icon: Icon, title, className = "" }: { icon: React.ElementType; title: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10" aria-hidden>
        <Icon className="size-4 text-primary" />
      </span>
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground sm:text-sm">{title}</h2>
    </div>
  );
}

function StatBlock({ label, value, tone, onClick }: { label: string; value: number; tone: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-24 flex-col justify-center gap-1 rounded-xl border bg-background/50 p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className={`text-3xl font-extrabold tabular-nums leading-none sm:text-4xl ${tone}`}>{value}</span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </button>
  );
}

function WeatherSnapshot({
  weather,
  loading,
  error,
  maybeStale,
  onRefresh,
  rainSlot,
}: {
  weather: WeatherDataDTO | null;
  loading: boolean;
  error: boolean;
  maybeStale: boolean;
  onRefresh: () => void;
  rainSlot: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border bg-background/50 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <CloudSun className="size-4 text-primary" aria-hidden /> Weather now
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onRefresh}
          aria-label="Refresh weather"
          disabled={loading}
        >
          <RefreshCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-24 rounded-lg" />
      ) : error || !weather ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-center">
          <CloudOff className="size-7 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Weather unavailable — your farm data is unaffected.</p>
          <p className="text-xs text-muted-foreground">The forecast will refresh automatically when the connection returns.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <span className="text-5xl" aria-hidden>{weatherEmoji(weather.code)}</span>
            <div className="min-w-0">
              <div className="text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">
                {weather.temperature}°C
              </div>
              <div className="mt-1 truncate text-sm text-muted-foreground">
                {weatherLabel(weather.code)} · {weather.location}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Droplets className="size-3.5" aria-hidden />{weather.humidity}% humidity</span>
            <span className="inline-flex items-center gap-1"><Wind className="size-3.5" aria-hidden />{weather.wind} km/h wind</span>
            <span className="inline-flex items-center gap-1">Feels like {weather.apparent}°</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden />
              {asOfLabel(weather.fetchedAt)}
            </span>
            {(weather?.stale || maybeStale) && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                role="status"
              >
                <Clock className="size-3" aria-hidden />
                Cached — may be stale (offline)
              </span>
            )}
          </div>

          {weather.forecast.length > 0 && (
            <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted/40 p-1.5 text-center">
              {weather.forecast.map((d) => (
                <div key={d.date} className="rounded-md p-1">
                  <div className="text-[10px] font-medium text-muted-foreground">
                    {new Date(d.date).toLocaleDateString("en-GB", { weekday: "short" })}
                  </div>
                  <div aria-hidden>{weatherEmoji(d.code)}</div>
                  <div className="text-[11px] font-semibold">{d.tempMax}°</div>
                  <div className="text-[10px] text-muted-foreground">{d.rainMm > 0 ? `${d.rainMm}mm` : "—"}</div>
                </div>
              ))}
            </div>
          )}

          {rainSlot}
        </>
      )}
    </div>
  );
}

function RainGauge({ rainfall, onLogRain }: { rainfall: RainfallResponseDTO | null; onLogRain: () => void }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5">
        <CloudRain className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-xs font-semibold">Your rain gauge</span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto min-h-8 gap-1 px-2.5 text-[11px]"
          onClick={onLogRain}
        >
          Log rain
        </Button>
      </div>
      {rainfall && (rainfall.last12Months > 0 || rainfall.lastRain) ? (
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-md bg-muted/60 px-1.5 py-1.5">
            <div className="text-sm font-bold tabular-nums">{rainfall.today != null ? `${rainfall.today} mm` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">today</div>
          </div>
          <div className="rounded-md bg-muted/60 px-1.5 py-1.5">
            <div className="text-sm font-bold tabular-nums">{rainfall.last7.toFixed(1)} mm</div>
            <div className="text-[10px] text-muted-foreground">7 days</div>
          </div>
          <div className="rounded-md bg-muted/60 px-1.5 py-1.5">
            <div className="text-sm font-bold tabular-nums">{rainfall.last30.toFixed(1)} mm</div>
            <div className="text-[10px] text-muted-foreground">30 days</div>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          No readings yet — logging daily rain helps you plan planting and watering.
        </p>
      )}
      {rainfall?.lastRain && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Last rain: {formatDateShort(rainfall.lastRain.date)} ({rainfall.lastRain.mm} mm) · trailing 12 months{" "}
          {rainfall.last12Months.toFixed(0)} mm
        </p>
      )}
    </div>
  );
}

function ListCard({
  title,
  icon: Icon,
  iconClass,
  count,
  countClass,
  onOpenAll,
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconClass: string;
  count: number;
  countClass: string;
  onOpenAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 rounded-xl">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon className={`size-4 shrink-0 ${iconClass}`} aria-hidden />
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
          {count > 0 && (
            <span className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold tabular-nums ${countClass}`}>
              {count}
            </span>
          )}
          <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1 text-xs" onClick={onOpenAll}>
            Open <ChevronRight className="size-3.5" aria-hidden />
          </Button>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Progressive disclosure: shows `limit` items, with a Show all / Show less expander. */
function ExpandableList<T>({ items, limit, children }: { items: T[]; limit: number; children: (visible: T[]) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  return (
    <div className="space-y-2">
      {children(visible)}
      {items.length > limit && (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-9 w-full text-xs font-medium text-primary"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : `Show all ${items.length}`}
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
        </Button>
      )}
    </div>
  );
}

function TaskRowItem({
  task,
  tone,
  busy,
  onComplete,
  onSnooze,
}: {
  task: TaskDTO;
  tone: string;
  busy: boolean;
  onComplete: (t: TaskDTO) => void;
  onSnooze?: (t: TaskDTO, days: number) => void;
}) {
  return (
    <div className={`flex min-h-11 items-center gap-2.5 rounded-lg border-l-4 py-2 pl-3 pr-2 ${tone}`}>
      <button
        onClick={() => onComplete(task)}
        disabled={busy}
        aria-label={`Complete: ${task.title}`}
        title="Complete task"
        className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
      >
        <Check className="size-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium sm:text-base">{task.title}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3" aria-hidden />
            {formatDateShort(task.dueDate)}
            {task.dueTime ? ` ${task.dueTime}` : ""}
          </span>
          {task.repeatRule !== "once" && <span title="Repeating task">🔁</span>}
          <span className="hidden sm:inline">{titleCase(task.category)}</span>
        </div>
      </div>
      <Badge className={`shrink-0 border ${priorityBadgeClass(task.priority)}`}>
        {PRIORITY_LABEL[task.priority] ?? titleCase(task.priority)}
      </Badge>
      {onSnooze && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 max-sm:size-11"
              disabled={busy}
              title="Snooze"
            >
              <CalendarClock className="size-4" aria-hidden />
              <span className="sr-only">Snooze task</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Snooze by</DropdownMenuLabel>
            {[1, 3, 7].map((d) => (
              <DropdownMenuItem key={d} className="min-h-9" onClick={() => onSnooze(task, d)}>
                {d} {d === 1 ? "day" : "days"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function GlanceRow({ icon: Icon, label, sub, value, onClick }: {
  icon: React.ElementType; label: string; sub: string; value: number | string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden>
        <Icon className="size-4 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{sub}</span>
      </span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function TopExpenses({ categories }: { categories: { category: string; total: number; label: string }[] }) {
  const max = Math.max(...categories.map((c) => c.total), 1);
  return (
    <ul className="space-y-2">
      {categories.map((c) => (
        <li key={c.category}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium">{titleCase(c.category)}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatKwacha(c.total, { compact: true })}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(6, Math.round((c.total / max) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{text}</div>
  );
}

function asOfLabel(fetchedAt: string): string {
  const d = new Date(fetchedAt);
  if (isNaN(d.getTime())) return "";
  return `As of ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function activityEmoji(type: string): string {
  const map: Record<string, string> = {
    planting: "🌱", fertilizer: "🧪", spraying: "💨", irrigation: "💧", weeding: "🌿", scouting: "🔍",
    harvesting: "🌾", equipment: "🚜", fencing: "🪵", feeding: "🐄", water: "🪣", transport: "🚚", other: "📌",
  };
  return map[type] ?? "📌";
}
