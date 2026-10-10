"use client";

/**
 * ReminderCenter — the header bell opens a live "needs attention" panel.
 *
 * Offline-first (Task 6-c): the list comes straight from the local reminder
 * engine (`evaluateReminders`) — the same engine that fires browser
 * notifications — so this panel works with no network at all and always
 * reflects the lead time / quiet hours configured in Settings. The list is
 * re-evaluated on open and after every complete/snooze.
 *
 * Browser-notification controls live here too (honest, permission-gated).
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BellRing,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  Moon,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import { apiGet, apiSend, qk } from "@/lib/api";
import { daysUntil, priorityBadgeClass, PRIORITY_LABEL, type FarmSettingsData } from "@/lib/farm";
import {
  evaluateReminders,
  reminderSummary,
  type DueReminder,
  type EvaluateResult,
} from "@/lib/offline/reminders";
import { useFarmStore } from "@/components/farm/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

const KIND_ICON: Record<DueReminder["kind"], LucideIcon> = {
  task: CalendarClock,
  vaccination: Syringe,
};

/** The engine prefixes titles with 🔴 / 💉 for OS notifications; the panel shows real icons instead. */
function cleanTitle(title: string): string {
  return title.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function dayLabel(dueDate: string): string {
  const d = daysUntil(dueDate);
  if (d === null) return "";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  return `In ${d}d`;
}

export default function ReminderCenter() {
  const setView = useFarmStore((s) => s.setView);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Notification permission is re-read each time the panel opens.
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [result, setResult] = useState<EvaluateResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);

  const { data: settings } = useQuery({
    queryKey: qk.settings,
    queryFn: () => apiGet<FarmSettingsData>("/api/settings"),
    enabled: open, // cheap local read, only when the panel is open
  });

  const syncPermission = () => {
    if (typeof window === "undefined" || !("Notification" in window)) setPermission("unsupported");
    else setPermission(Notification.permission);
  };

  /** Run the local reminder engine now (reads the IndexedDB farm database). */
  const runEvaluate = useCallback(async () => {
    setEvaluating(true);
    try {
      setResult(await evaluateReminders());
    } catch {
      /* keep the previous list — never block the panel on an engine hiccup */
    } finally {
      setEvaluating(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    syncPermission();
    void runEvaluate();
  }, [open, runEvaluate]);

  const reminders = result?.reminders ?? [];
  const overdue = reminders.filter((r) => r.overdue);
  const upcoming = reminders.filter((r) => !r.overdue);
  const badgeCount = reminders.length;

  const closeAndGo = (view: "tasks" | "livestock") => {
    setView(view);
    setOpen(false);
  };

  const taskAction = async (r: DueReminder, action: "complete" | "snooze") => {
    if (busyIds.includes(r.id)) return;
    setBusyIds((b) => [...b, r.id]);
    try {
      if (action === "complete") {
        await apiSend(`/api/tasks/${r.id}/complete`, "POST");
        toast.success(`Completed “${cleanTitle(r.title)}”.`);
      } else {
        await apiSend(`/api/tasks/${r.id}/snooze`, "POST", { days: 1 });
        toast.success(`Snoozed “${cleanTitle(r.title)}” by 1 day.`);
      }
      queryClient.invalidateQueries({ queryKey: qk.tasks });
      await runEvaluate(); // re-evaluate so the list updates immediately
    } catch (err) {
      toast.error((err as Error).message || "That did not work — please try again.");
    } finally {
      setBusyIds((b) => b.filter((x) => x !== r.id));
    }
  };

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      toast.info("This browser does not support notifications. In-app reminders still work.");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      toast.success("Browser reminders enabled on this device.");
      void runEvaluate(); // items may now be shown as OS notifications
    } else {
      toast.info("No problem — reminders still appear inside the app.");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative size-9"
          aria-label={`Reminders${badgeCount > 0 ? ` — ${badgeCount} need attention` : ""}`}
        >
          <BellRing className={`size-4 ${permission === "granted" ? "text-emerald-600" : ""}`} aria-hidden />
          {badgeCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white shadow-sm"
              aria-hidden
            >
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0 sm:w-96" aria-describedby="reminder-center-desc">
        <div id="reminder-center-desc" className="sr-only">
          Live list of overdue and upcoming farm tasks and vaccinations, evaluated from your data on this device.
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              Reminders
              {evaluating && <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {result
                ? reminderSummary(reminders)
                : "Checking your farm data…"}
            </p>
          </div>
          <button
            type="button"
            className="flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => closeAndGo("tasks")}
          >
            All tasks <ChevronRight className="size-3" aria-hidden />
          </button>
        </div>

        {/* Quiet hours notice — the engine held notifications back */}
        {result?.skippedQuietHours && (
          <p className="flex items-center gap-1.5 border-b bg-amber-50 px-4 py-2 text-[11px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <Moon className="size-3.5 shrink-0" aria-hidden />
            Quiet hours — notifications will resume in the morning.
          </p>
        )}

        {/* Feed */}
        <div className="farm-scroll max-h-[min(26rem,60vh)] overflow-y-auto px-3 py-3">
          {!result ? (
            <div className="space-y-2 p-1">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-3/4" />
            </div>
          ) : reminders.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
              <span className="text-2xl" aria-hidden>🌾</span>
              <p className="text-sm font-medium">All quiet on the farm</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                No overdue or upcoming tasks or vaccinations within your reminder window.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <ReminderGroup label="Overdue" reminders={overdue} busyIds={busyIds} onView={closeAndGo} onTaskAction={(r, a) => void taskAction(r, a)} />
              <ReminderGroup label="Due soon" reminders={upcoming} busyIds={busyIds} onView={closeAndGo} onTaskAction={(r, a) => void taskAction(r, a)} />
            </div>
          )}
        </div>

        {/* Footer — notification controls (honest semantics) */}
        <div className="space-y-2 border-t bg-muted/30 px-4 py-3">
          {settings && !settings.notificationsEnabled && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Notifications are off — reminders still appear here whenever the app is open.
            </p>
          )}
          {permission === "granted" ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-snug text-muted-foreground">
                Browser reminders are on. Alerts show while the app is open.
              </p>
            </div>
          ) : permission === "denied" ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Browser notifications are blocked in your browser settings — in-app reminders still work.
            </p>
          ) : permission === "unsupported" ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              This browser does not support notifications — in-app reminders still work.
            </p>
          ) : (
            <Button size="sm" className="h-8 w-full text-xs" onClick={() => void requestPermission()}>
              <BellRing className="size-3.5" aria-hidden />
              Turn on browser reminders
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- list ----------

function ReminderGroup({
  label,
  reminders,
  busyIds,
  onView,
  onTaskAction,
}: {
  label: string;
  reminders: DueReminder[];
  busyIds: string[];
  onView: (view: "tasks" | "livestock") => void;
  onTaskAction: (reminder: DueReminder, action: "complete" | "snooze") => void;
}) {
  if (reminders.length === 0) return null;
  return (
    <div>
      <div className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label} <span className="font-semibold text-foreground/70">({reminders.length})</span>
      </div>
      <ul className="space-y-1.5">
        {reminders.map((r) => (
          <ReminderRow
            key={`${r.kind}-${r.id}`}
            reminder={r}
            busy={busyIds.includes(r.id)}
            onView={onView}
            onTaskAction={onTaskAction}
          />
        ))}
      </ul>
    </div>
  );
}

function ReminderRow({
  reminder,
  busy,
  onView,
  onTaskAction,
}: {
  reminder: DueReminder;
  busy: boolean;
  onView: (view: "tasks" | "livestock") => void;
  onTaskAction: (reminder: DueReminder, action: "complete" | "snooze") => void;
}) {
  const Icon = KIND_ICON[reminder.kind];
  const isTask = reminder.kind === "task";
  return (
    <li
      className={`rounded-lg border px-2.5 py-2 ${
        reminder.overdue
          ? "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30"
          : "bg-card"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={`mt-0.5 size-4 shrink-0 ${reminder.overdue ? "text-red-600 dark:text-red-400" : reminder.kind === "vaccination" ? "text-teal-600 dark:text-teal-400" : "text-primary"}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[13px] font-medium leading-tight">{cleanTitle(reminder.title)}</span>
            <Badge variant="outline" className={`px-1.5 py-0 text-[10px] font-semibold ${priorityBadgeClass(reminder.priority)}`}>
              {PRIORITY_LABEL[reminder.priority] ?? reminder.priority}
            </Badge>
            <span
              className={`text-[10px] font-semibold ${reminder.overdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
            >
              {dayLabel(reminder.dueDate)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{reminder.body}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => onView(isTask ? "tasks" : "livestock")}
            >
              <Eye className="size-3" aria-hidden />
              View
            </Button>
            {isTask && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => onTaskAction(reminder, "snooze")}
                >
                  {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Clock className="size-3" aria-hidden />}
                  Snooze 1 day
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 border-emerald-200 px-2 text-[11px] text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                  disabled={busy}
                  onClick={() => onTaskAction(reminder, "complete")}
                >
                  {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
                  Complete
                </Button>
              </>
            )}
            {!isTask && (
              <span className="text-[10px] leading-tight text-muted-foreground">
                Vaccination record — keep it up to date in Livestock.
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
