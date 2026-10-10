"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiSend, qk } from "@/lib/api";
import { formatDateShort } from "@/lib/farm";
import type { TaskWithLinks } from "./task-types";

export interface CompleteTaskResponse {
  completed: TaskWithLinks;
  next: TaskWithLinks | null;
}

/** POST /api/tasks/[id]/complete — shared by the tasks view and the calendar day dialog. */
export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiSend<CompleteTaskResponse>(`/api/tasks/${id}/complete`, "POST"),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: qk.tasks });
      queryClient.invalidateQueries({ queryKey: qk.summary });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      if (data.next) {
        toast.success(
          `Task completed — next occurrence scheduled for ${formatDateShort(data.next.dueDate)}`
        );
      } else {
        toast.success("Task completed");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Failed to complete task"),
  });
}

/** POST /api/tasks/[id]/snooze — push dueDate forward, stays open. */
export function useSnoozeTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) =>
      apiSend<TaskWithLinks>(`/api/tasks/${id}/snooze`, "POST", { days }),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: qk.tasks });
      queryClient.invalidateQueries({ queryKey: qk.summary });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      toast.success(`Snoozed — now due ${formatDateShort(task.dueDate)}`);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to snooze task"),
  });
}

/** DELETE /api/tasks/[id] */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<{ ok: boolean }>(`/api/tasks/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.tasks });
      queryClient.invalidateQueries({ queryKey: qk.summary });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      toast.success("Task deleted");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete task"),
  });
}
