"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPinned } from "lucide-react";
import { apiSend } from "@/lib/api";
import type { FieldDTO } from "@/lib/farm";
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
import { invalidateFarmData } from "./shared";

/** Create/edit form for a farm field. Parent should mount it only while open (fresh state). */
export function FieldFormDialog({
  open,
  onOpenChange,
  field,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: FieldDTO | null;
}) {
  const qc = useQueryClient();
  const editing = Boolean(field);
  const [name, setName] = useState(() => field?.name ?? "");
  const [areaHa, setAreaHa] = useState(() =>
    field?.areaHa != null ? String(field.areaHa) : ""
  );
  const [location, setLocation] = useState(() => field?.location ?? "");
  const [irrigation, setIrrigation] = useState(() => field?.irrigation ?? "");
  const [soilNotes, setSoilNotes] = useState(() => field?.soilNotes ?? "");
  const [notes, setNotes] = useState(() => field?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Field name is required.");
      return;
    }
    let area: number | null = null;
    if (areaHa.trim() !== "") {
      area = Number(areaHa);
      if (!isFinite(area) || area <= 0) {
        toast.error("Area must be a positive number of hectares.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        areaHa: area,
        location: location.trim() || null,
        irrigation: irrigation.trim() || null,
        soilNotes: soilNotes.trim() || null,
        notes: notes.trim() || null,
      };
      if (editing && field) {
        await apiSend(`/api/fields/${field.id}`, "PUT", payload);
        toast.success(`Field "${payload.name}" updated.`);
      } else {
        await apiSend("/api/fields", "POST", payload);
        toast.success(`Field "${payload.name}" added.`);
      }
      invalidateFarmData(qc);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not save the field.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPinned className="size-5 text-primary" aria-hidden />
            {editing ? "Edit field" : "Add field"}
          </DialogTitle>
          <DialogDescription>
            A field is a plot of land — record its size, position and soil so crop plans stay organised.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="field-name">Name *</Label>
              <Input
                id="field-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Big Field"
                className="min-h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-area">Area (hectares)</Label>
              <Input
                id="field-area"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={areaHa}
                onChange={(e) => setAreaHa(e.target.value)}
                placeholder="e.g. 2.5"
                className="min-h-11"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-location">Location</Label>
            <Input
              id="field-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. North of the homestead, along the dambo"
              className="min-h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-irrigation">Irrigation</Label>
            <Input
              id="field-irrigation"
              value={irrigation}
              onChange={(e) => setIrrigation(e.target.value)}
              placeholder="e.g. Rain-fed, furrow from the stream, drip"
              className="min-h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-soil">Soil notes</Label>
            <Textarea
              id="field-soil"
              value={soilNotes}
              onChange={(e) => setSoilNotes(e.target.value)}
              placeholder="Soil type, drainage, fertility observations…"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="field-notes">Notes</Label>
            <Textarea
              id="field-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth remembering about this field…"
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
