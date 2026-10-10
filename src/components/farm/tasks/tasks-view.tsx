"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck2,
  CircleAlert,
  CircleCheckBig,
  ListTodo,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, qk } from "@/lib/api";
import { cn } from "@/lib/utils";
import { computeTaskStatus, formatDate, startOfToday } from "@/lib/farm";
import type { TaskStatus } from "@/lib/farm";
import { useFarmStore } from "../store";
import { useCompleteTask, useDeleteTask, useSnoozeTask } from "./use-task-actions";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskRow } from "./task-row";
import type { TaskWithLinks } from "./task-types";

interface SectionDef {
  key: TaskStatus;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  countClass: string;
  cardClass?: string;
}

const SECTIONS: SectionDef[] = [
  {
    key: "overdue",
    title: "Overdue",
    hint: "Nothing overdue — you're on top of things 🎉",
    icon: CircleAlert,
    iconClass: "text-destructive",
    countClass: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
    cardClass: "border-destructive/40",
  },
  {
    key: "due_today",
    title: "Due today",
    hint: "Nothing due — enjoy the quiet 🌾",
    icon: CalendarCheck2,
    iconClass: "text-amber-600 dark:text-amber-400",
    countClass: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  {
    key: "upcoming",
    title: "Upcoming",
    hint: "No upcoming tasks yet — add one to stay ahead of the season.",
    icon: ListTodo,
    iconClass: "text-primary",
    countClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  {
    key: "done",
    title: "Completed",
    hint: "Completed tasks will appear here.",
    icon: CircleCheckBig,
    iconClass: "text-muted-foreground",
    countClass: "bg-stone-100 text-stone-600 dark:bg-stone-800/60 dark:text-stone-300",
  },
];

export default function TasksView() {
  const quickAction = useFarmStore((s) => s.quickAction);
  const consumeQuickAction = useFarmStore((s) => s.consumeQuickAction);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskWithLinks | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: qk.tasks,
    queryFn: () => apiGet<TaskWithLinks[]>("/api/tasks"),
  });

  const complete = useCompleteTask();
  const snooze = useSnoozeTask();
  const remove = useDeleteTask();
  const busy = complete.isPending || snooze.isPending || remove.isPending;

  // Quick action from the shell (e.g. "＋ Task" buttons elsewhere in the app)
  useEffect(() => {
    if (quickAction === "add-task") {
      const t = setTimeout(() => {
        setEditing(null);
        setFormOpen(true);
        consumeQuickAction();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [quickAction, consumeQuickAction]);

  const sections = useMemo(() => {
    const buckets: Record<TaskStatus, TaskWithLinks[]> = {
      overdue: [],
      due_today: [],
      upcoming: [],
      done: [],
      cancelled: [],
    };
    for (const t of tasks ?? []) buckets[computeTaskStatus(t)].push(t);
    return buckets;
  }, [tasks]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (task: TaskWithLinks) => {
    setEditing(task);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tasks &amp; Reminders</h1>
          <p className="text-sm text-muted-foreground">
            Today is {formatDate(startOfToday().toISOString())} — overdue items stay here until they are done.
          </p>
        </div>
        <Button className="min-h-11" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          New Task
        </Button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2" role="status" aria-label="Task summary">
        {[
          { label: "Overdue", n: sections.overdue.length, cls: SECTIONS[0].countClass },
          { label: "Due today", n: sections.due_today.length, cls: SECTIONS[1].countClass },
          { label: "Upcoming", n: sections.upcoming.length, cls: SECTIONS[2].countClass },
          { label: "Completed", n: sections.done.length + sections.cancelled.length, cls: SECTIONS[3].countClass },
        ].map((chip) => (
          <span
            key={chip.label}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full border border-transparent px-3 text-xs font-medium",
              chip.cls
            )}
          >
            <span className="text-sm font-semibold">{chip.n}</span>
            {chip.label}
          </span>
        ))}
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="flex flex-col gap-3" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Sections */}
      {!isLoading && (
        <>
          {SECTIONS.map((section) => {
            const list =
              section.key === "done"
                ? [...sections.done, ...sections.cancelled]
                : sections[section.key];
            const isCollapsedDone = section.key === "done" && !completedOpen;
            const Icon = section.icon;

            return (
              <section key={section.key} aria-label={section.title} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className={cn("size-4", section.iconClass)} aria-hidden />
                    {section.title}
                    <span
                      className={cn(
                        "inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold",
                        section.countClass,
                        list.length === 0 && "opacity-60"
                      )}
                    >
                      {list.length}
                    </span>
                  </h2>
                  {section.key === "done" && list.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-9"
                      onClick={() => setCompletedOpen((o) => !o)}
                      aria-expanded={completedOpen}
                    >
                      {completedOpen ? "Hide" : "Show"}
                    </Button>
                  )}
                </div>

                {list.length === 0 ? (
                  <Card className={cn("border-dashed bg-transparent shadow-none", section.cardClass)}>
                    <CardContent className="px-4 py-5 text-sm text-muted-foreground">
                      {section.hint}
                    </CardContent>
                  </Card>
                ) : isCollapsedDone ? (
                  <Card className="border-dashed bg-transparent shadow-none">
                    <CardContent className="px-4 py-3 text-sm text-muted-foreground">
                      {list.length} finished {list.length === 1 ? "task" : "tasks"} —{" "}
                      <button
                        className="font-medium text-primary underline-offset-2 hover:underline"
                        onClick={() => setCompletedOpen(true)}
                      >
                        show them
                      </button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-3">
                    {list.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        status={computeTaskStatus(task)}
                        busy={busy}
                        onComplete={(t) => complete.mutate(t.id)}
                        onSnooze={(t, days) => snooze.mutate({ id: t.id, days })}
                        onEdit={openEdit}
                        onDelete={(t) => remove.mutate(t.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}

      {/* Create / edit dialog — keyed remount resets the form without effects */}
      {formOpen && (
        <TaskFormDialog key={editing?.id ?? "new"} open={formOpen} task={editing} onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}
