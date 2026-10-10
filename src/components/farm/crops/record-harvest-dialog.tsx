"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Scissors } from "lucide-react";
import { apiSend } from "@/lib/api";
import { HARVEST_UNITS, formatKwacha, from_dateInputValue, startOfToday, toDateInputValue } from "@/lib/farm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invalidateFarmData } from "./shared";
import type { CropCycleWithField, HarvestResponse } from "./types";

/** Record a harvest for a crop cycle (optionally logging the sale as income). */
export function RecordHarvestDialog({
  open,
  onOpenChange,
  cycle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycle: CropCycleWithField;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState<string>(() => toDateInputValue(startOfToday().toISOString()));
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<string>(HARVEST_UNITS[0]);
  const [saleAmount, setSaleAmount] = useState("");
  const [recordSale, setRecordSale] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const qty = Number(quantity);
    if (!isFinite(qty) || qty <= 0) {
      toast.error("Harvest quantity must be a positive number.");
      return;
    }
    const dateIso = from_dateInputValue(date);
    if (!dateIso) {
      toast.error("Please pick a valid harvest date.");
      return;
    }
    let sale: number | null = null;
    if (saleAmount.trim() !== "") {
      sale = Number(saleAmount);
      if (!isFinite(sale) || sale <= 0) {
        toast.error("Sale amount must be a positive number.");
        return;
      }
    }
    if (recordSale && sale === null) {
      toast.error("Enter the sale amount, or untick “Record this sale as income”.");
      return;
    }

    setSaving(true);
    try {
      const res = await apiSend<HarvestResponse>(`/api/crops/${cycle.id}/harvest`, "POST", {
        actualHarvestDate: dateIso,
        harvestQuantity: qty,
        harvestUnit: unit,
        saleAmount: sale,
        recordSale,
      });
      invalidateFarmData(qc);
      if (res.transaction) {
        toast.success(`Harvest recorded — ${cycle.crop}`, {
          description: `${formatKwacha(res.transaction.amount)} was logged as income under “Crop sales”.`,
        });
      } else {
        toast.success(`Harvest recorded — ${cycle.crop}`);
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not record the harvest.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="size-5 text-primary" aria-hidden />
            Record harvest
          </DialogTitle>
          <DialogDescription>
            {cycle.crop}
            {cycle.variety ? ` · ${cycle.variety}` : ""} — mark this cycle as harvested.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="harvest-date">Harvest date</Label>
              <Input
                id="harvest-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="harvest-quantity">Quantity *</Label>
              <Input
                id="harvest-quantity"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 38"
                className="min-h-11"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="harvest-unit">Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger id="harvest-unit" className="min-h-11 w-full">
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                {HARVEST_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="harvest-sale">Sale amount (ZMW, optional)</Label>
            <Input
              id="harvest-sale"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={saleAmount}
              onChange={(e) => setSaleAmount(e.target.value)}
              placeholder="e.g. 12500"
              className="min-h-11"
            />
          </div>

          <label
            htmlFor="harvest-record-sale"
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-card/60 px-3 py-2.5 text-sm"
          >
            <Checkbox
              id="harvest-record-sale"
              checked={recordSale}
              onCheckedChange={(checked) => setRecordSale(checked === true)}
            />
            <span>Record this sale as income (Crop sales)</span>
          </label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving ? "Saving…" : "Record harvest"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
