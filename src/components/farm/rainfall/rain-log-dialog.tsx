"use client";

/**
 * RainLogDialog — log or update the rainfall reading for one day (Task r4).
 * One record per day: saving again for the same date overwrites the amount.
 * Used from the dashboard weather card and the calendar day dialog.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CloudRain, Loader2 } from "lucide-react";
import { apiSend, qk } from "@/lib/api";
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

interface RainLogDialogProps {
  /** Pre-selected day (ISO or Date-convertible). Defaults to today. */
  date?: string;
  /** Known existing reading for that day (edit mode). */
  existing?: { mm: number; note?: string | null } | null;
  onClose: () => void;
  onSaved?: () => void;
}

function toDateInputValue(v?: string): string {
  const d = v ? new Date(v) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function RainLogDialog({ date, existing, onClose, onSaved }: RainLogDialogProps) {
  const queryClient = useQueryClient();
  const [day, setDay] = useState(toDateInputValue(date));
  const [mm, setMm] = useState(existing?.mm != null ? String(existing.mm) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);

  const parsed = Number(mm);
  const valid = mm.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 500;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await apiSend("/api/rainfall", "POST", {
        date: new Date(`${day}T12:00:00`).toISOString(),
        mm: parsed,
        note: note.trim() || null,
      });
      toast.success(
        parsed === 0 ? "Rainfall logged — dry day" : `Rainfall logged: ${parsed} mm`
      );
      for (const key of [qk.rainfall, qk.dashboard]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the rainfall record");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudRain className="size-4 text-cyan-600" aria-hidden />
            Log rainfall
          </DialogTitle>
          <DialogDescription>
            One reading per day — saving the same day again updates the amount.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rain-date">Date</Label>
              <Input
                id="rain-date"
                type="date"
                value={day}
                max={toDateInputValue()}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rain-mm">Rainfall (mm) *</Label>
              <Input
                id="rain-mm"
                type="number"
                step="any"
                min="0"
                max="500"
                placeholder="e.g. 12.5"
                value={mm}
                onChange={(e) => setMm(e.target.value)}
                aria-required="true"
                aria-invalid={mm.trim() !== "" && !valid}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rain-note">Note</Label>
            <Input
              id="rain-note"
              placeholder="e.g. heavy afternoon storm"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Tip: 0 mm is worth logging too — it confirms you checked on a dry day. Use a plain
            gauge or an old jar marked in millimetres.
          </p>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="min-h-11 sm:min-h-9" disabled={saving || !valid}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save reading
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
