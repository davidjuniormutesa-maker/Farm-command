"use client";

/**
 * WeightRecordDialog — record a weight measurement for one animal (Task r3).
 * Mounted only while open. On save it POSTs to /api/animals/[id]/weights;
 * the server keeps the animal's headline weight in sync when this is the
 * newest measurement.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Scale } from "lucide-react";
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

interface WeightRecordDialogProps {
  animalId: string;
  animalLabel: string;
  /** Current headline weight shown as a hint. */
  currentWeightKg?: number | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function WeightRecordDialog({
  animalId,
  animalLabel,
  currentWeightKg,
  onClose,
  onSaved,
}: WeightRecordDialogProps) {
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(toDateInputValue(new Date().toISOString()));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ weight?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const nextErrors: { weight?: string; date?: string } = {};
    const n = Number(weight);
    if (weight.trim() === "" || !Number.isFinite(n)) nextErrors.weight = "Weight is required";
    else if (n <= 0) nextErrors.weight = "Weight must be greater than zero";
    if (!date) nextErrors.date = "Date is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await apiSend(`/api/animals/${animalId}/weights`, "POST", {
        weightKg: n,
        recordedAt: from_dateInputValue(date) ?? new Date().toISOString(),
        note: note.trim() || undefined,
      });
      toast.success(`Weight recorded for ${animalLabel}`, {
        description: `${n.toLocaleString()} kg on ${date}`,
      });
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the weight");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" aria-hidden>
              <Scale className="size-4" />
            </span>
            Record weight
          </DialogTitle>
          <DialogDescription>
            For <span className="font-medium text-foreground">{animalLabel}</span>
            {currentWeightKg != null ? ` · last weight ${currentWeightKg.toLocaleString()} kg` : " · first measurement"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="weight-kg">Weight (kg)</Label>
              <Input
                id="weight-kg"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                placeholder={currentWeightKg != null ? String(currentWeightKg) : "e.g. 320"}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                aria-invalid={Boolean(errors.weight)}
                autoFocus
              />
              {errors.weight && <p className="text-xs text-destructive">{errors.weight}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight-date">Date</Label>
              <Input
                id="weight-date"
                type="date"
                max={toDateInputValue(new Date().toISOString())}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={Boolean(errors.date)}
              />
              {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weight-note">
              Note <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="weight-note"
              rows={2}
              placeholder="e.g. after morning grazing, condition score good"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
            />
          </div>
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            The newest measurement becomes the animal&apos;s current weight on cards and lists.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="min-h-11" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save weight
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
