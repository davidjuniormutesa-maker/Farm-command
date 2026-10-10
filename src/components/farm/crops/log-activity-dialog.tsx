"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, NotebookPen } from "lucide-react";
import { apiSend } from "@/lib/api";
import { ACTIVITY_TYPES, from_dateInputValue, startOfToday, titleCase, toDateInputValue } from "@/lib/farm";
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
import { invalidateFarmData, ACTIVITY_TYPE_EMOJI } from "./shared";
import type { ActivityLinkContext } from "./types";

/**
 * Shared "Log activity" dialog — records an entry in the farm activity log.
 * Link ids (cropCycleId/fieldId/animalId/groupId) are pre-set by the context
 * that opens it; with no context the entry is logged unlinked.
 *
 * The parent should mount this component only while it is open (or give it a
 * fresh `key` per open) so form state resets between uses.
 */
export function LogActivityDialog({
  open,
  onOpenChange,
  context,
  contextLabel,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: ActivityLinkContext;
  contextLabel?: string;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<string>("other");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>(() => toDateInputValue(startOfToday().toISOString()));
  const [details, setDetails] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please give the activity a title.");
      return;
    }
    const dateIso = from_dateInputValue(date);
    if (!dateIso) {
      toast.error("Please pick a valid date.");
      return;
    }
    const costNum = cost.trim() === "" ? null : Number(cost);
    if (costNum !== null && (!isFinite(costNum) || costNum <= 0)) {
      toast.error("Cost must be a positive number.");
      return;
    }
    setSaving(true);
    try {
      await apiSend("/api/activities", "POST", {
        type,
        title: title.trim(),
        date: dateIso,
        details: details.trim() || null,
        cost: costNum,
        cropCycleId: context?.cropCycleId || null,
        fieldId: context?.fieldId || null,
        animalId: context?.animalId || null,
        groupId: context?.groupId || null,
      });
      invalidateFarmData(qc);
      toast.success("Activity logged.");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not log the activity.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="size-5 text-primary" aria-hidden />
            Log activity
          </DialogTitle>
          <DialogDescription>
            Keep a timestamped record of the work done on the farm.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="activity-type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="activity-type" className="min-h-11 w-full">
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      <span aria-hidden>{ACTIVITY_TYPE_EMOJI[t] ?? "📝"}</span> {titleCase(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-date">Date</Label>
              <Input
                id="activity-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-11"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity-title">Title</Label>
            <Input
              id="activity-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Top-dressed maize with urea"
              className="min-h-11"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity-details">Details (optional)</Label>
            <Textarea
              id="activity-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Observations, inputs used, quantities…"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity-cost">Cost (ZMW, optional)</Label>
            <Input
              id="activity-cost"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
              className="min-h-11"
            />
          </div>

          {contextLabel && (
            <p className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Link2 className="size-3.5 shrink-0" aria-hidden />
              Will be linked to <span className="font-medium text-foreground">{contextLabel}</span>
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving ? "Saving…" : "Save activity"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
