"use client";

/**
 * VaccinationFormDialog — record or edit a vaccination (Task 2-a).
 * When a next-due date is set, the API automatically creates/updates a Task
 * reminder (category "health"). Target can be fixed (detail dialog) or freely
 * selected. Mounted only while open.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiSend } from "@/lib/api";
import { from_dateInputValue, toDateInputValue } from "@/lib/farm";
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
import type { AnimalWithGroup, FormTarget, VaccinationWithRefs } from "./livestock-helpers";
import { animalRefLabel } from "./livestock-helpers";
import type { LivestockGroupDTO } from "@/lib/farm";

interface VaccinationFormDialogProps {
  /** Fixed target (from a detail dialog). Ignored in edit mode. */
  target?: FormTarget | null;
  animals: AnimalWithGroup[];
  groups: LivestockGroupDTO[];
  /** Existing vaccination to edit, or null to create. */
  vaccination: VaccinationWithRefs | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function VaccinationFormDialog({
  target,
  animals,
  groups,
  vaccination,
  onClose,
  onSaved,
}: VaccinationFormDialogProps) {
  const editing = Boolean(vaccination);

  const fixedTarget: FormTarget | null = useMemo(() => {
    if (vaccination) {
      if (vaccination.animal)
        return { animalId: vaccination.animalId ?? null, groupId: null, label: animalRefLabel(vaccination.animal) };
      if (vaccination.group)
        return { animalId: null, groupId: vaccination.groupId ?? null, label: vaccination.group.name };
      return null;
    }
    return target ?? null;
  }, [vaccination, target]);

  const [targetValue, setTargetValue] = useState("");
  const [values, setValues] = useState({
    vaccineName: vaccination?.vaccineName ?? "",
    dateGiven: toDateInputValue(vaccination?.dateGiven ?? new Date().toISOString()),
    nextDueDate: toDateInputValue(vaccination?.nextDueDate),
    batchNumber: vaccination?.batchNumber ?? "",
    administeredBy: vaccination?.administeredBy ?? "",
    notes: vaccination?.notes ?? "",
  });
  const [errors, setErrors] = useState<{ target?: string; vaccineName?: string; dateGiven?: string }>({});
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<typeof values>) => setValues((v) => ({ ...v, ...patch }));

  const submit = async () => {
    const nextErrors: { target?: string; vaccineName?: string; dateGiven?: string } = {};
    let resolvedTarget = fixedTarget;
    if (!resolvedTarget) {
      if (!targetValue) {
        nextErrors.target = "Select an animal or a group";
      } else if (targetValue.startsWith("animal:")) {
        const animal = animals.find((a) => a.id === targetValue.slice(7));
        resolvedTarget = animal ? { animalId: animal.id, groupId: null, label: animalRefLabel(animal) } : null;
      } else {
        const group = groups.find((g) => g.id === targetValue.slice(6));
        resolvedTarget = group ? { animalId: null, groupId: group.id, label: group.name } : null;
      }
      if (!resolvedTarget) nextErrors.target = "Select an animal or a group";
    }
    if (!values.vaccineName.trim()) nextErrors.vaccineName = "Vaccine name is required";
    if (!values.dateGiven) nextErrors.dateGiven = "Date given is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !resolvedTarget) return;

    setSaving(true);
    const hasReminder = Boolean(values.nextDueDate);
    try {
      const payload = {
        animalId: resolvedTarget.animalId ?? null,
        groupId: resolvedTarget.groupId ?? null,
        vaccineName: values.vaccineName.trim(),
        dateGiven: from_dateInputValue(values.dateGiven) ?? new Date().toISOString(),
        nextDueDate: from_dateInputValue(values.nextDueDate),
        batchNumber: values.batchNumber.trim() || null,
        administeredBy: values.administeredBy.trim() || null,
        notes: values.notes.trim() || null,
      };
      if (vaccination) {
        await apiSend(`/api/vaccinations/${vaccination.id}`, "PUT", payload);
        toast.success("Vaccination updated", {
          description: hasReminder
            ? "Its reminder task was rescheduled to the new next-due date."
            : "Any open reminder task for it was removed.",
        });
      } else {
        await apiSend("/api/vaccinations", "POST", payload);
        toast.success(`Vaccination recorded for ${resolvedTarget.label}`, {
          description: hasReminder
            ? "A reminder task was created for the next-due date."
            : undefined,
        });
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the vaccination");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit vaccination" : "Record vaccination"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this vaccination record. Changing the next-due date reschedules its reminder task."
              : fixedTarget
                ? `Recording for ${fixedTarget.label}. Schedules are entered by you or your vet — the app only reminds you.`
                : "Record a vaccination against an animal or a group. No schedules are invented — you enter what your vet advises."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!fixedTarget && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="vac-target">Record for *</Label>
              <Select value={targetValue} onValueChange={setTargetValue}>
                <SelectTrigger id="vac-target" className="w-full" aria-label="Record for" aria-invalid={Boolean(errors.target)}>
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

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vac-name">Vaccine name *</Label>
            <Input
              id="vac-name"
              value={values.vaccineName}
              onChange={(e) => set({ vaccineName: e.target.value })}
              placeholder="e.g. FMD (Foot & Mouth) booster"
              aria-required="true"
              aria-invalid={Boolean(errors.vaccineName)}
            />
            {errors.vaccineName && <p className="text-xs text-destructive">{errors.vaccineName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vac-given">Date given *</Label>
            <Input
              id="vac-given"
              type="date"
              value={values.dateGiven}
              onChange={(e) => set({ dateGiven: e.target.value })}
              aria-invalid={Boolean(errors.dateGiven)}
            />
            {errors.dateGiven && <p className="text-xs text-destructive">{errors.dateGiven}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vac-next">Next due (optional)</Label>
            <Input
              id="vac-next"
              type="date"
              value={values.nextDueDate}
              onChange={(e) => set({ nextDueDate: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              A reminder task is created automatically for this date.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vac-batch">Batch / lot number</Label>
            <Input
              id="vac-batch"
              value={values.batchNumber}
              onChange={(e) => set({ batchNumber: e.target.value })}
              placeholder="e.g. FMD-ZM-2201"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vac-by">Administered by</Label>
            <Input
              id="vac-by"
              value={values.administeredBy}
              onChange={(e) => set({ administeredBy: e.target.value })}
              placeholder="e.g. Self / Dr. Mwansa (vet)"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vac-notes">Notes</Label>
            <Textarea
              id="vac-notes"
              rows={3}
              value={values.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Reactions, follow-up, where the record came from…"
            />
          </div>
        </div>

        <DialogFooter className="mt-2 gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" className="min-h-11" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {editing ? "Save changes" : "Record vaccination"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
