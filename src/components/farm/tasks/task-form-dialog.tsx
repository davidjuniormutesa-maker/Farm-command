"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend, qk } from "@/lib/api";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  REPEAT_RULES,
  TASK_CATEGORIES,
  from_dateInputValue,
  titleCase,
  toDateInputValue,
} from "@/lib/farm";
import type { AnimalDTO, CropCycleDTO, FieldDTO, LivestockGroupDTO } from "@/lib/farm";
import type { TaskWithLinks } from "./task-types";

const REPEAT_LABELS: Record<string, string> = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  custom_days: "Every N days",
};

interface FormState {
  title: string;
  description: string;
  category: string;
  dueDate: string; // yyyy-mm-dd
  dueTime: string; // HH:mm or ""
  priority: string;
  repeatRule: string;
  repeatIntervalDays: string;
  leadTimeDays: string;
  assignee: string;
  link: string; // "" | "animal:id" | "group:id" | "field:id" | "crop:id"
  notes: string;
}

function todayValue(): string {
  return toDateInputValue(new Date().toISOString());
}

function initialState(task?: TaskWithLinks | null): FormState {
  if (task) {
    let link = "";
    if (task.animalId) link = `animal:${task.animalId}`;
    else if (task.groupId) link = `group:${task.groupId}`;
    else if (task.fieldId) link = `field:${task.fieldId}`;
    else if (task.cropCycleId) link = `crop:${task.cropCycleId}`;
    return {
      title: task.title,
      description: task.description ?? "",
      category: task.category,
      dueDate: toDateInputValue(task.dueDate),
      dueTime: task.dueTime ?? "",
      priority: task.priority,
      repeatRule: task.repeatRule,
      repeatIntervalDays: task.repeatIntervalDays ? String(task.repeatIntervalDays) : "1",
      leadTimeDays: String(task.leadTimeDays ?? 0),
      assignee: task.assignee ?? "",
      link,
      notes: task.notes ?? "",
    };
  }
  return {
    title: "",
    description: "",
    category: "general",
    dueDate: todayValue(),
    dueTime: "",
    priority: "medium",
    repeatRule: "once",
    repeatIntervalDays: "1",
    leadTimeDays: "0",
    assignee: "",
    link: "",
    notes: "",
  };
}

interface TaskFormDialogProps {
  open: boolean;
  task?: TaskWithLinks | null;
  onClose: () => void;
}

/** Create / edit dialog. Remount (via key) resets state — no effects needed. */
export function TaskFormDialog({ open, task, onClose }: TaskFormDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialState(task));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Link sources — routes owned by other agents; degrade to empty lists if unavailable.
  const animals = useQuery({
    queryKey: qk.animals,
    queryFn: () => apiGet<AnimalDTO[]>("/api/animals").catch(() => [] as AnimalDTO[]),
  });
  const groups = useQuery({
    queryKey: qk.groups,
    queryFn: () => apiGet<LivestockGroupDTO[]>("/api/groups").catch(() => [] as LivestockGroupDTO[]),
  });
  const fields = useQuery({
    queryKey: qk.fields,
    queryFn: () => apiGet<FieldDTO[]>("/api/fields").catch(() => [] as FieldDTO[]),
  });
  const crops = useQuery({
    queryKey: qk.crops,
    queryFn: () => apiGet<CropCycleDTO[]>("/api/crops").catch(() => [] as CropCycleDTO[]),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const linkFields = useMemo(() => {
    const [kind, id] = form.link.includes(":") ? form.link.split(":") : ["", ""];
    return {
      animalId: kind === "animal" ? id : null,
      groupId: kind === "group" ? id : null,
      fieldId: kind === "field" ? id : null,
      cropCycleId: kind === "crop" ? id : null,
    };
  }, [form.link]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      task
        ? apiSend<TaskWithLinks>(`/api/tasks/${task.id}`, "PUT", body)
        : apiSend<TaskWithLinks>("/api/tasks", "POST", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.tasks });
      queryClient.invalidateQueries({ queryKey: qk.summary });
      queryClient.invalidateQueries({ queryKey: qk.dashboard });
      toast.success(task ? "Task updated" : "Task created");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save task"),
  });

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.dueDate) errs.dueDate = "Due date is required";
    else if (!from_dateInputValue(form.dueDate)) {
      errs.dueDate = "Enter a valid date";
    }
    if (form.dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.dueTime)) {
      errs.dueTime = "Use 24-hour HH:mm";
    }
    if (form.repeatRule === "custom_days") {
      const n = Number(form.repeatIntervalDays);
      if (!Number.isInteger(n) || n <= 0) {
        errs.repeatIntervalDays = "Enter a positive whole number of days";
      }
    }
    const lead = Number(form.leadTimeDays || "0");
    if (!Number.isInteger(lead) || lead < 0) {
      errs.leadTimeDays = "Lead time must be 0 or more days";
    }
    return errs;
  }

  function handleSubmit() {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const interval =
      form.repeatRule === "custom_days" ? Number(form.repeatIntervalDays) : null;
    mutation.mutate({
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      dueDate: from_dateInputValue(form.dueDate),
      dueTime: form.dueTime || null,
      priority: form.priority,
      repeatRule: form.repeatRule,
      repeatIntervalDays: interval,
      leadTimeDays: Number(form.leadTimeDays || "0"),
      ...linkFields,
      assignee: form.assignee.trim() || null,
      notes: form.notes.trim() || null,
    });
  }

  const hasAnimals = (animals.data?.length ?? 0) > 0;
  const hasGroups = (groups.data?.length ?? 0) > 0;
  const hasFields = (fields.data?.length ?? 0) > 0;
  const hasCrops = (crops.data?.length ?? 0) > 0;
  const noLinks = !hasAnimals && !hasGroups && !hasFields && !hasCrops;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="farm-scroll max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {task
              ? "Update the details of this task or reminder."
              : "Add a chore, reminder or deadline. Repeating tasks schedule their next occurrence when completed."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Title */}
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">Title *</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Dip cattle against ticks"
              aria-invalid={Boolean(errors.title)}
              className="min-h-11"
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional details — what, where, how much…"
              rows={2}
            />
          </div>

          {/* Category + Priority */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {titleCase(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due date + time */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="task-due">Due date *</Label>
              <Input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                aria-invalid={Boolean(errors.dueDate)}
                className="min-h-11"
              />
              {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="task-time">Due time (optional)</Label>
              <Input
                id="task-time"
                type="time"
                value={form.dueTime}
                onChange={(e) => set("dueTime", e.target.value)}
                aria-invalid={Boolean(errors.dueTime)}
                className="min-h-11"
              />
              {errors.dueTime && <p className="text-xs text-destructive">{errors.dueTime}</p>}
            </div>
          </div>

          {/* Repeat rule + interval */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Repeat</Label>
              <Select value={form.repeatRule} onValueChange={(v) => set("repeatRule", v)}>
                <SelectTrigger className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPEAT_RULES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {REPEAT_LABELS[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.repeatRule === "custom_days" && (
              <div className="grid gap-1.5">
                <Label htmlFor="task-interval">Repeat every (days) *</Label>
                <Input
                  id="task-interval"
                  type="number"
                  min={1}
                  step={1}
                  value={form.repeatIntervalDays}
                  onChange={(e) => set("repeatIntervalDays", e.target.value)}
                  aria-invalid={Boolean(errors.repeatIntervalDays)}
                  className="min-h-11"
                />
                {errors.repeatIntervalDays && (
                  <p className="text-xs text-destructive">{errors.repeatIntervalDays}</p>
                )}
              </div>
            )}
          </div>

          {/* Lead time + assignee */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="task-lead">Reminder lead time (days)</Label>
              <Input
                id="task-lead"
                type="number"
                min={0}
                step={1}
                value={form.leadTimeDays}
                onChange={(e) => set("leadTimeDays", e.target.value)}
                aria-invalid={Boolean(errors.leadTimeDays)}
                className="min-h-11"
              />
              {errors.leadTimeDays && (
                <p className="text-xs text-destructive">{errors.leadTimeDays}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="task-assignee">Assign to (optional)</Label>
              <Input
                id="task-assignee"
                value={form.assignee}
                onChange={(e) => set("assignee", e.target.value)}
                placeholder="e.g. Chanda"
                className="min-h-11"
              />
            </div>
          </div>

          {/* Link to */}
          <div className="grid gap-1.5">
            <Label>Link to (optional)</Label>
            <Select
              value={form.link}
              onValueChange={(v) => set("link", v === "none" ? "" : v)}
            >
              <SelectTrigger className="min-h-11 w-full">
                <SelectValue placeholder="Not linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {hasAnimals && (
                  <SelectGroup>
                    <SelectLabel>Animals</SelectLabel>
                    {(animals.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={`animal:${a.id}`}>
                        {a.tagId}
                        {a.name ? ` — ${a.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {hasGroups && (
                  <SelectGroup>
                    <SelectLabel>Herds &amp; flocks</SelectLabel>
                    {(groups.data ?? []).map((g) => (
                      <SelectItem key={g.id} value={`group:${g.id}`}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {hasFields && (
                  <SelectGroup>
                    <SelectLabel>Fields</SelectLabel>
                    {(fields.data ?? []).map((f) => (
                      <SelectItem key={f.id} value={`field:${f.id}`}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {hasCrops && (
                  <SelectGroup>
                    <SelectLabel>Crops</SelectLabel>
                    {(crops.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={`crop:${c.id}`}>
                        {c.crop}
                        {c.variety ? ` — ${c.variety}` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {noLinks && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Add animals, fields or crops first to link tasks to them.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Private notes — supplier prices, who to call…"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11 sm:min-h-9" onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {task ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
