"use client";

import { CalendarClock, Check, MapPin, Pencil, Repeat2, Sprout, Tag, Trash2, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  formatDateShort,
  initialsOf,
  priorityBadgeClass,
  titleCase,
} from "@/lib/farm";
import type { TaskStatus } from "@/lib/farm";
import { TASK_CATEGORY_ICONS, repeatRuleLabel } from "./task-types";
import type { TaskWithLinks } from "./task-types";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-stone-400",
};

const chipClass =
  "inline-flex min-h-6 items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground";

interface TaskRowProps {
  task: TaskWithLinks;
  status: TaskStatus;
  busy?: boolean;
  onComplete: (task: TaskWithLinks) => void;
  onSnooze: (task: TaskWithLinks, days: number) => void;
  onEdit: (task: TaskWithLinks) => void;
  onDelete: (task: TaskWithLinks) => void;
}

export function TaskRow({ task, status, busy, onComplete, onSnooze, onEdit, onDelete }: TaskRowProps) {
  const CategoryIcon = TASK_CATEGORY_ICONS[task.category] ?? TASK_CATEGORY_ICONS.general;
  const repeat = repeatRuleLabel(task.repeatRule, task.repeatIntervalDays);
  const isSettled = status === "done" || status === "cancelled";
  const dueLabel = `${formatDateShort(task.dueDate)}${task.dueTime ? ` · ${task.dueTime}` : ""}`;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30",
        status === "overdue" && "border-l-4 border-l-red-500",
        isSettled && "opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          title={`${PRIORITY_LABEL[task.priority] ?? "Medium"} priority`}
          className={cn(
            "mt-1.5 size-2.5 shrink-0 rounded-full",
            PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.low
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p
              className={cn(
                "min-w-0 break-words text-sm font-medium leading-5",
                status === "done" && "line-through decoration-muted-foreground/60"
              )}
            >
              {task.title}
            </p>
            <span
              className={cn(
                "rounded-full border px-1.5 py-px text-[11px] font-medium",
                priorityBadgeClass(task.priority)
              )}
            >
              {PRIORITY_LABEL[task.priority] ?? titleCase(task.priority)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={chipClass}>
              <CategoryIcon className="size-3" aria-hidden />
              {titleCase(task.category)}
            </span>
            <span
              className={cn(
                chipClass,
                status === "overdue" && "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
                status === "due_today" && "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              )}
            >
              <CalendarClock className="size-3" aria-hidden />
              {status === "done" && task.completedAt
                ? `Completed ${formatDateShort(task.completedAt)}`
                : status === "cancelled"
                  ? "Cancelled"
                  : dueLabel}
            </span>
            {repeat && !isSettled && (
              <span className={chipClass} title="Repeats">
                <Repeat2 className="size-3" aria-hidden />🔁 {repeat}
              </span>
            )}
            {task.animal && (
              <span className={chipClass} title="Linked animal">
                <Tag className="size-3" aria-hidden />
                {task.animal.tagId}
                {task.animal.name ? ` · ${task.animal.name}` : ""}
              </span>
            )}
            {task.group && (
              <span className={chipClass} title="Linked group">
                <Users className="size-3" aria-hidden />
                {task.group.name}
              </span>
            )}
            {task.cropCycle && (
              <span className={chipClass} title="Linked crop">
                <Sprout className="size-3" aria-hidden />
                {task.cropCycle.crop}
              </span>
            )}
            {task.field && (
              <span className={chipClass} title="Linked field">
                <MapPin className="size-3" aria-hidden />
                {task.field.name}
              </span>
            )}
            {task.leadTimeDays > 0 && !isSettled && (
              <span className={chipClass} title="Reminder lead time">
                {task.leadTimeDays}-day heads-up
              </span>
            )}
            {task.assignee && (
              <Avatar className="size-6" title={`Assigned to ${task.assignee}`}>
                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                  {initialsOf(task.assignee)}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {!isSettled && (
            <>
              <Button
                size="sm"
                className="h-9 min-h-11 px-3 sm:min-h-9"
                disabled={busy}
                onClick={() => onComplete(task)}
              >
                <Check className="size-4" aria-hidden />
                <span className="hidden sm:inline">Complete</span>
                <span className="sr-only sm:hidden">Complete task</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 max-sm:size-11"
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
              <Button
                variant="ghost"
                size="icon"
                className="size-9 max-sm:size-11"
                disabled={busy}
                title="Edit task"
                onClick={() => onEdit(task)}
              >
                <Pencil className="size-4" aria-hidden />
                <span className="sr-only">Edit task</span>
              </Button>
            </>
          )}
          {status === "cancelled" && (
            <span className="mr-1 hidden rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
              {TASK_STATUS_LABEL.cancelled}
            </span>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 max-sm:size-11 text-muted-foreground hover:text-destructive"
                disabled={busy}
                title="Delete task"
              >
                <Trash2 className="size-4" aria-hidden />
                <span className="sr-only">Delete task</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{task.title}” will be permanently removed. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11 sm:min-h-9">Keep task</AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11 bg-destructive text-white hover:bg-destructive/90 sm:min-h-9"
                  onClick={() => onDelete(task)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
