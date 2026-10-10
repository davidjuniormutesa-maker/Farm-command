"use client";

/**
 * HealthEventFormDialog — record or edit a health/lifecycle event (Task 2-a).
 * Target can be fixed (opened from an animal/group detail dialog) or freely
 * selected (quick action / health section). Mounted only while open.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiSend } from "@/lib/api";
import { HEALTH_EVENT_TYPES, from_dateInputValue, titleCase, toDateInputValue } from "@/lib/farm";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HealthEventWithRefs, FormTarget, AnimalWithGroup } from "./livestock-helpers";
import { animalRefLabel } from "./livestock-helpers";
import type { LivestockGroupDTO } from "@/lib/farm";

interface HealthEventFormDialogProps {
  /** Fixed target (from a detail dialog). Ignored in edit mode. */
  target?: FormTarget | null;
  animals: AnimalWithGroup[];
  groups: LivestockGroupDTO[];
  /** Existing event to edit, or null to create. */
  event: HealthEventWithRefs | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function HealthEventFormDialog({
  target,
  animals,
  groups,
  event,
  onClose,
  onSaved,
}: HealthEventFormDialogProps) {
  const editing = Boolean(event);

  // Resolve the fixed target: explicit prop, or the edited event's own refs.
  const fixedTarget: FormTarget | null = useMemo(() => {
    if (event) {
      if (event.animal) return { animalId: event.animalId ?? null, groupId: null, label: animalRefLabel(event.animal) };
      if (event.group) return { animalId: null, groupId: event.groupId ?? null, label: event.group.name };
      return null;
    }
    return target ?? null;
  }, [event, target]);

  const [targetValue, setTargetValue] = useState("");
  const [values, setValues] = useState({
    type: event?.type ?? target?.defaultType ?? "observation",
    title: event?.title ?? "",
    date: toDateInputValue(event?.date ?? new Date().toISOString()),
    details: event?.details ?? "",
    administeredBy: event?.administeredBy ?? "",
    medication: event?.medication ?? "",
    withdrawalDays: event?.withdrawalDays != null ? String(event.withdrawalDays) : "",
  });
  const [errors, setErrors] = useState<{ target?: string; title?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<typeof values>) => setValues((v) => ({ ...v, ...patch }));

  const submit = async () => {
    const nextErrors: { target?: string; title?: string; date?: string } = {};
    let resolvedTarget = fixedTarget;
    if (!resolvedTarget) {
      if (!targetValue) {
        nextErrors.target = "Select an animal or a group";
      } else if (targetValue.startsWith("animal:")) {
        const animal = animals.find((a) => a.id === targetValue.slice(7));
        resolvedTarget = animal
          ? { animalId: animal.id, groupId: null, label: animalRefLabel(animal) }
          : null;
      } else {
        const group = groups.find((g) => g.id === targetValue.slice(6));
        resolvedTarget = group ? { animalId: null, groupId: group.id, label: group.name } : null;
      }
      if (!resolvedTarget) nextErrors.target = "Select an animal or a group";
    }
    if (!values.title.trim()) nextErrors.title = "Title is required";
    if (!values.date) nextErrors.date = "Date is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !resolvedTarget) return;

    setSaving(true);
    try {
      const payload = {
        animalId: resolvedTarget.animalId ?? null,
        groupId: resolvedTarget.groupId ?? null,
        type: values.type,
        title: values.title.trim(),
        date: from_dateInputValue(values.date) ?? new Date().toISOString(),
        details: values.details.trim() || null,
        administeredBy: values.administeredBy.trim() || null,
        medication: values.medication.trim() || null,
        withdrawalDays:
          values.withdrawalDays.trim() === "" || !Number.isFinite(Number(values.withdrawalDays))
            ? null
            : Math.trunc(Number(values.withdrawalDays)),
      };
      if (event) {
        await apiSend(`/api/health-events/${event.id}`, "PUT", payload);
        toast.success("Health event updated");
      } else {
        await apiSend("/api/health-events", "POST", payload);
        toast.success(`Health event recorded for ${resolvedTarget.label}`);
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the health event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit health event" : "Record health event"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this timeline record."
              : fixedTarget
                ? `Recording for ${fixedTarget.label}. Log observations, treatments, vet visits, breeding and more.`
                : "Log observations, treatments, vet visits, breeding and more against an animal or a group."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!fixedTarget && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="health-target">Record for *</Label>
              <Select value={targetValue} onValueChange={setTargetValue}>
                <SelectTrigger id="health-target" className="w-full" aria-label="Record for" aria-invalid={Boolean(errors.target)}>
                  <SelectValue placeholder="Select an animal or a group" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectGroup>
                    <SelectLabel>Animals</SelectLabel>
                    {animals.map((a) => (
                      <SelectItem key={a.id} value={`animal:${a.id}`}>
                        {animalRefLabel(a)} ({a.species})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Groups</SelectLabel>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={`group:${g.id}`}>
                        {g.name} ({g.species})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {errors.target && <p className="text-xs text-destructive">{errors.target}</p>}
              {animals.length === 0 && groups.length === 0 && (
                <p className="text-xs text-muted-foreground">Add an animal or a group first.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="health-type">Type *</Label>
            <Select value={values.type} onValueChange={(v) => set({ type: v })}>
              <SelectTrigger id="health-type" className="w-full" aria-label="Event type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {HEALTH_EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {titleCase(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="health-date">Date *</Label>
            <Input
              id="health-date"
              type="date"
              value={values.date}
              onChange={(e) => set({ date: e.target.value })}
              aria-invalid={Boolean(errors.date)}
            />
            {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="health-title">Title *</Label>
            <Input
              id="health-title"
              value={values.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g. Dewormed / Vet visit — lame left leg"
              aria-required="true"
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="health-by">Administered / done by</Label>
            <Input
              id="health-by"
              value={values.administeredBy}
              onChange={(e) => set({ administeredBy: e.target.value })}
              placeholder="e.g. Self / Dr. Mwansa (vet)"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="health-med">Medication</Label>
            <Input
              id="health-med"
              value={values.medication}
              onChange={(e) => set({ medication: e.target.value })}
              placeholder="e.g. Albendazole 10%"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="health-withdrawal">Withdrawal (days)</Label>
            <Input
              id="health-withdrawal"
              type="number"
              min="0"
              step="1"
              value={values.withdrawalDays}
              onChange={(e) => set({ withdrawalDays: e.target.value })}
              placeholder="e.g. 14"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="health-details">Details</Label>
            <Textarea
              id="health-details"
              rows={3}
              value={values.details}
              onChange={(e) => set({ details: e.target.value })}
              placeholder="Symptoms, dosage guidance from the vet, follow-up needed…"
            />
          </div>
        </div>

        <DialogFooter className="mt-2 gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" className="min-h-11" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {editing ? "Save changes" : "Record event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
