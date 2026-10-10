"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sprout } from "lucide-react";
import { apiSend } from "@/lib/api";
import { ZAMBIA_CROPS, from_dateInputValue, toDateInputValue } from "@/lib/farm";
import type { CropCycleDTO } from "@/lib/farm";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invalidateFarmData } from "./shared";
import type { CropCycleWithField, FieldWithCycles } from "./types";

const CROP_STATUSES = ["planned", "growing", "harvested", "ended"] as const;

const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  growing: "Growing",
  harvested: "Harvested",
  ended: "Ended",
};

const OTHER = "Other";
const NO_FIELD = "__none__";

/** Create/edit form for a crop cycle. Parent should mount it only while open (fresh state). */
export function CropCycleFormDialog({
  open,
  onOpenChange,
  cycle,
  fields,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: CropCycleWithField | null;
  fields: FieldWithCycles[];
}) {
  const qc = useQueryClient();
  const editing = Boolean(cycle);

  const isKnownCrop = (crop: string | null | undefined) =>
    !!crop && (ZAMBIA_CROPS as readonly string[]).includes(crop);

  const [cropChoice, setCropChoice] = useState<string>(() =>
    cycle ? (isKnownCrop(cycle.crop) ? cycle.crop : OTHER) : ZAMBIA_CROPS[0]
  );
  const [customCrop, setCustomCrop] = useState<string>(() =>
    cycle && !isKnownCrop(cycle.crop) ? cycle.crop : ""
  );
  const [variety, setVariety] = useState(() => cycle?.variety ?? "");
  const [fieldId, setFieldId] = useState<string>(() => cycle?.fieldId ?? NO_FIELD);
  const [plantingDate, setPlantingDate] = useState(() => toDateInputValue(cycle?.plantingDate ?? null));
  const [expectedHarvestDate, setExpectedHarvestDate] = useState(() =>
    toDateInputValue(cycle?.expectedHarvestDate ?? null)
  );
  const [seedDetails, setSeedDetails] = useState(() => cycle?.seedDetails ?? "");
  const [status, setStatus] = useState<string>(() => (cycle?.status as CropCycleDTO["status"]) ?? "planned");
  const [notes, setNotes] = useState(() => cycle?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const crop = cropChoice === OTHER ? customCrop.trim() : cropChoice;
    if (!crop) {
      toast.error("Please specify the crop name.");
      return;
    }

    const plantingIso = from_dateInputValue(plantingDate);
    const harvestIso = from_dateInputValue(expectedHarvestDate);
    if (plantingIso && harvestIso && harvestIso < plantingIso) {
      toast.error("Expected harvest date cannot be before the planting date.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        crop,
        variety: variety.trim() || null,
        fieldId: fieldId === NO_FIELD ? null : fieldId,
        plantingDate: plantingIso,
        expectedHarvestDate: harvestIso,
        seedDetails: seedDetails.trim() || null,
        status,
        notes: notes.trim() || null,
      };
      if (editing && cycle) {
        await apiSend(`/api/crops/${cycle.id}`, "PUT", payload);
        toast.success(`${crop} cycle updated.`);
      } else {
        await apiSend("/api/crops", "POST", payload);
        toast.success(`${crop} cycle added.`);
      }
      invalidateFarmData(qc);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not save the crop cycle.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="farm-scroll max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sprout className="size-5 text-primary" aria-hidden />
            {editing ? "Edit crop cycle" : "New crop cycle"}
          </DialogTitle>
          <DialogDescription>
            Track a crop from planting through to harvest and sale.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cycle-crop">Crop *</Label>
              <Select value={cropChoice} onValueChange={setCropChoice}>
                <SelectTrigger id="cycle-crop" className="min-h-11 w-full">
                  <SelectValue placeholder="Choose crop" />
                </SelectTrigger>
                <SelectContent>
                  {ZAMBIA_CROPS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-variety">Variety</Label>
              <Input
                id="cycle-variety"
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                placeholder="e.g. ZMS 602, Santa Rosa"
                className="min-h-11"
              />
            </div>
          </div>

          {cropChoice === OTHER && (
            <div className="space-y-2">
              <Label htmlFor="cycle-crop-custom">Crop name (specify) *</Label>
              <Input
                id="cycle-crop-custom"
                value={customCrop}
                onChange={(e) => setCustomCrop(e.target.value)}
                placeholder="e.g. Sweet Potatoes, Watermelon"
                className="min-h-11"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cycle-field">Field</Label>
            <Select value={fieldId} onValueChange={setFieldId}>
              <SelectTrigger id="cycle-field" className="min-h-11 w-full">
                <SelectValue placeholder="Choose field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FIELD}>No field</SelectItem>
                {fields.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cycle-planting">Planting date</Label>
              <Input
                id="cycle-planting"
                type="date"
                value={plantingDate}
                onChange={(e) => setPlantingDate(e.target.value)}
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-expected">Expected harvest date</Label>
              <Input
                id="cycle-expected"
                type="date"
                value={expectedHarvestDate}
                onChange={(e) => setExpectedHarvestDate(e.target.value)}
                className="min-h-11"
                aria-invalid={
                  Boolean(plantingDate && expectedHarvestDate && expectedHarvestDate < plantingDate) || undefined
                }
              />
              {plantingDate && expectedHarvestDate && expectedHarvestDate < plantingDate && (
                <p className="text-xs text-destructive">Must be on or after the planting date.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cycle-seed">Seed / input details</Label>
              <Input
                id="cycle-seed"
                value={seedDetails}
                onChange={(e) => setSeedDetails(e.target.value)}
                placeholder="e.g. 20 kg certified seed"
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="cycle-status" className="min-h-11 w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {CROP_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cycle-notes">Notes</Label>
            <Textarea
              id="cycle-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Spacing, fertiliser plan, observations…"
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create cycle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
