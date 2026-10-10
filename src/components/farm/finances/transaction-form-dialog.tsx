"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiSend, qk } from "@/lib/api";
import type { AnimalDTO, CropCycleDTO, FieldDTO } from "@/lib/farm";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, toDateInputValue, from_dateInputValue } from "@/lib/farm";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { FinanceRow } from "./finance-types";
import { PAYMENT_METHODS } from "./finance-types";

type TxType = "income" | "expense";

const OTHER_LABEL: Record<TxType, string> = { income: "Other income", expense: "Other" };

function todayInput(): string {
  return toDateInputValue(new Date().toISOString());
}

/**
 * Create / edit transaction dialog.
 * Mounted only while open (keyed by editing id) so state resets each time.
 */
export function TransactionFormDialog({ editing, onClose }: { editing: FinanceRow | null; onClose: () => void }) {
  const [type, setType] = useState<TxType>(editing ? (editing.type === "income" ? "income" : "expense") : "expense");
  const [category, setCategory] = useState<string>(editing?.category ?? "Feed");
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [date, setDate] = useState(editing ? toDateInputValue(editing.date) : todayInput());
  const [description, setDescription] = useState(editing?.description ?? "");
  const [paymentMethod, setPaymentMethod] = useState(editing?.paymentMethod ?? "");
  const [fieldId, setFieldId] = useState(editing?.fieldId ?? "");
  const [cropCycleId, setCropCycleId] = useState(editing?.cropCycleId ?? "");
  const [animalId, setAnimalId] = useState(editing?.animalId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Optional link lists — safe to fail (peer module APIs) → just show empty options.
  const fieldsQuery = useQuery<FieldDTO[]>({ queryKey: qk.fields, queryFn: () => apiGet<FieldDTO[]>("/api/fields"), retry: false });
  const cropsQuery = useQuery<CropCycleDTO[]>({ queryKey: qk.crops, queryFn: () => apiGet<CropCycleDTO[]>("/api/crops"), retry: false });
  const animalsQuery = useQuery<AnimalDTO[]>({ queryKey: qk.animals, queryFn: () => apiGet<AnimalDTO[]>("/api/animals"), retry: false });

  const fields = fieldsQuery.data ?? [];
  const crops = cropsQuery.data ?? [];
  const animals = animalsQuery.data ?? [];

  const categoryOptions = useMemo(
    () => (type === "income" ? (INCOME_CATEGORIES as readonly string[]) : (EXPENSE_CATEGORIES as readonly string[])),
    [type]
  );

  function switchType(next: TxType) {
    if (next === type) return;
    setType(next);
    setCategory(next === "income" ? "Crop sales" : "Feed");
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    const amt = Number(amount);
    if (amount.trim() === "" || Number.isNaN(amt) || amt <= 0) {
      next.amount = "Enter an amount greater than 0";
    }
    if (!date) next.date = "Pick a date";
    if (description.trim() === "") next.description = "Describe the transaction";
    if (category === OTHER_LABEL[type] && customCategory.trim() === "" && categoryOptions.includes(category)) {
      next.category = `Name the ${type} category or pick one from the list`;
    }
    return next;
  }

  const mutation = useMutation({
    mutationFn: (payload: unknown) =>
      editing
        ? apiSend<FinanceRow>(`/api/finance/${editing.id}`, "PUT", payload)
        : apiSend<FinanceRow>("/api/finance", "POST", payload),
    onSuccess: () => {
      toast.success(editing ? "Transaction updated" : "Transaction recorded");
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || "Could not save the transaction"),
  });

  function submit() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const isoDate = from_dateInputValue(date);
    if (!isoDate) {
      setErrors({ date: "Pick a valid date" });
      return;
    }

    const finalCategory =
      category === OTHER_LABEL[type] && customCategory.trim() !== "" ? customCategory.trim() : category;

    mutation.mutate({
      type,
      category: finalCategory,
      amount: Number(amount),
      date: isoDate,
      description: description.trim(),
      paymentMethod: paymentMethod || null,
      fieldId: fieldId || null,
      cropCycleId: cropCycleId || null,
      animalId: animalId || null,
      groupId: null,
    });
  }

  const err = (key: string) =>
    errors[key] ? <p className="text-xs font-medium text-destructive">{errors[key]}</p> : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto farm-scroll sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "Record transaction"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update the details of this entry." : "Money in (income) or money out (expense) — keep your farm book up to date."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type toggle */}
          <div
            className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1"
            role="group"
            aria-label="Transaction type"
          >
            {(["income", "expense"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchType(t)}
                aria-pressed={type === t}
                className={`min-h-11 rounded-lg px-3 text-sm font-medium transition-colors ${
                  type === t
                    ? t === "income"
                      ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-700"
                      : "bg-red-600 text-white shadow-sm dark:bg-red-700"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "income" ? "Income (money in)" : "Expense (money out)"}
              </button>
            ))}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="tx-category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="tx-category" className="min-h-11 w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {category === OTHER_LABEL[type] && (
              <Input
                placeholder={type === "income" ? "e.g. Manure sales" : "e.g. Transport fines"}
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="mt-2 min-h-11"
                aria-label="Custom category name"
              />
            )}
            {err("category")}
          </div>

          {/* Amount + date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">Amount (ZMW)</Label>
              <Input
                id="tx-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="min-h-11"
              />
              {err("amount")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-11"
              />
              {err("date")}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="tx-description">Description</Label>
            <Input
              id="tx-description"
              placeholder="e.g. Sold 5 bags maize to FRA"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-11"
            />
            {err("description")}
          </div>

          {/* Payment method */}
          <div className="space-y-1.5">
            <Label htmlFor="tx-payment">Payment method (optional)</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="tx-payment" className="min-h-11 w-full">
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional links */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-field">Field</Label>
              <Select value={fieldId || "none"} onValueChange={(v) => setFieldId(v === "none" ? "" : v)}>
                <SelectTrigger id="tx-field" className="min-h-11 w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {fields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-crop">Crop</Label>
              <Select value={cropCycleId || "none"} onValueChange={(v) => setCropCycleId(v === "none" ? "" : v)}>
                <SelectTrigger id="tx-crop" className="min-h-11 w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {crops.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.variety ? `${c.crop} — ${c.variety}` : c.crop}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-animal">Animal</Label>
              <Select value={animalId || "none"} onValueChange={(v) => setAnimalId(v === "none" ? "" : v)}>
                <SelectTrigger id="tx-animal" className="min-h-11 w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {animals.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name ? `${a.tagId} · ${a.name}` : a.tagId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="min-h-11" disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} className="min-h-11" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {editing ? "Save changes" : "Record transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
