"use client";

/**
 * PoultryFlockFormDialog — create or edit a poultry flock.
 * Mirrors GroupFormDialog, but for the dedicated Poultry section: a bird type
 * (Chickens / Ducks / Quail / Turkeys / Geese) drives species-correct role
 * words, plus a light-touch feed note. Mounted only while open so state is fresh.
 */

import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { apiSend } from "@/lib/api";
import {
  BIRD_TYPES,
  BIRD_TYPE_EMOJI,
  ROLE_LABEL,
  birdRoleWord,
  flockRoleSummary,
} from "@/lib/farm";
import type { PoultryFlockDTO } from "@/lib/farm";
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

interface PoultryFlockFormDialogProps {
  /** Existing flock to edit, or null to create. */
  flock: PoultryFlockDTO | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FlockFormValues {
  name: string;
  birdType: string;
  breed: string;
  count: string;
  breedingMaleCount: string;
  breedingFemaleCount: string;
  youngCount: string;
  castratedCount: string;
  location: string;
  feedNote: string;
  notes: string;
  photo: string | null;
}

/** Parse a form string to a non-negative whole number (blank/invalid → 0). */
function toNonNegInt(value: string): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export default function PoultryFlockFormDialog({ flock, onClose, onSaved }: PoultryFlockFormDialogProps) {
  const [saving, setSaving] = useState(false);
  const photoFileRef = useRef<HTMLInputElement | null>(null);
  const [values, setValues] = useState<FlockFormValues>({
    name: flock?.name ?? "",
    birdType: flock?.birdType ?? "Chickens",
    breed: flock?.breed ?? "",
    count: flock ? String(flock.count) : "0",
    breedingMaleCount: flock?.breedingMaleCount ? String(flock.breedingMaleCount) : "0",
    breedingFemaleCount: flock?.breedingFemaleCount ? String(flock.breedingFemaleCount) : "0",
    youngCount: flock?.youngCount ? String(flock.youngCount) : "0",
    castratedCount: flock?.castratedCount ? String(flock.castratedCount) : "0",
    location: flock?.location ?? "",
    feedNote: flock?.feedNote ?? "",
    notes: flock?.notes ?? "",
    photo: flock?.photo ?? null,
  });
  const [errors, setErrors] = useState<{ name?: string; count?: string }>({});
  const editing = Boolean(flock);

  const set = (patch: Partial<FlockFormValues>) => setValues((v) => ({ ...v, ...patch }));

  const handlePhotoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That file is not an image — choose a photo file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        set({ photo: reader.result });
        toast.success("Photo added");
      } else {
        toast.error("Could not read that file — try another photo.");
      }
    };
    reader.onerror = () => toast.error("Could not read that file — try another photo.");
    reader.readAsDataURL(file);
  };

  const summary = flockRoleSummary({
    birdType: values.birdType,
    breedingMaleCount: toNonNegInt(values.breedingMaleCount),
    breedingFemaleCount: toNonNegInt(values.breedingFemaleCount),
    youngCount: toNonNegInt(values.youngCount),
    castratedCount: toNonNegInt(values.castratedCount),
  });

  const submit = async () => {
    const nextErrors: { name?: string; count?: string } = {};
    if (!values.name.trim()) nextErrors.name = "Flock name is required";
    const count = Number(values.count);
    if (values.count.trim() === "" || !Number.isInteger(count) || count < 0) {
      nextErrors.count = "Count must be a whole number (0 or more)";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        name: values.name.trim(),
        birdType: values.birdType,
        breed: values.breed.trim() || null,
        count,
        breedingMaleCount: toNonNegInt(values.breedingMaleCount),
        breedingFemaleCount: toNonNegInt(values.breedingFemaleCount),
        youngCount: toNonNegInt(values.youngCount),
        castratedCount: toNonNegInt(values.castratedCount),
        location: values.location.trim() || null,
        feedNote: values.feedNote.trim() || null,
        notes: values.notes.trim() || null,
        photo: values.photo || null,
      };
      if (flock) {
        await apiSend(`/api/poultry/${flock.id}`, "PUT", payload);
        toast.success(`Flock "${payload.name}" updated`);
      } else {
        await apiSend("/api/poultry", "POST", payload);
        toast.success(`Flock "${payload.name}" created`);
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the flock");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${flock?.name}` : "Add flock"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this poultry flock."
              : "A flock groups birds of one kind so you can log daily egg collection and keep a simple head-count."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="flock-name">Flock name *</Label>
            <Input
              id="flock-name"
              value={values.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Layer hens"
              aria-required="true"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flock-bird-type">Bird type *</Label>
            <Select value={values.birdType} onValueChange={(v) => set({ birdType: v })}>
              <SelectTrigger id="flock-bird-type" className="w-full" aria-label="Bird type">
                <SelectValue placeholder="Select bird type" />
              </SelectTrigger>
              <SelectContent>
                {BIRD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {BIRD_TYPE_EMOJI[t]} {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flock-breed">Breed</Label>
            <Input
              id="flock-breed"
              value={values.breed}
              onChange={(e) => set({ breed: e.target.value })}
              placeholder="e.g. Black Australorp"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flock-count">Count (birds)</Label>
            <Input
              id="flock-count"
              type="number"
              min="0"
              step="1"
              value={values.count}
              onChange={(e) => set({ count: e.target.value })}
              aria-invalid={Boolean(errors.count)}
            />
            {errors.count && <p className="text-xs text-destructive">{errors.count}</p>}
          </div>

          {/* Optional role breakdown (uses bird-correct words for the chosen type). */}
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3 sm:col-span-2">
            <p className="text-sm font-medium">Breakdown (optional)</p>
            <p className="text-xs text-muted-foreground">
              How many of each kind. Leave as 0 if you don&apos;t track this.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="flock-breeding-male" className="text-xs">
                  {ROLE_LABEL.breedingMale}
                  <span className="ml-1 text-muted-foreground">
                    ({birdRoleWord(values.birdType, "breedingMale", 2)})
                  </span>
                </Label>
                <Input
                  id="flock-breeding-male"
                  type="number"
                  min="0"
                  step="1"
                  value={values.breedingMaleCount}
                  onChange={(e) => set({ breedingMaleCount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flock-breeding-female" className="text-xs">
                  {ROLE_LABEL.breedingFemale}
                  <span className="ml-1 text-muted-foreground">
                    ({birdRoleWord(values.birdType, "breedingFemale", 2)})
                  </span>
                </Label>
                <Input
                  id="flock-breeding-female"
                  type="number"
                  min="0"
                  step="1"
                  value={values.breedingFemaleCount}
                  onChange={(e) => set({ breedingFemaleCount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flock-young" className="text-xs">
                  {ROLE_LABEL.young}
                  <span className="ml-1 text-muted-foreground">
                    ({birdRoleWord(values.birdType, "young", 2)})
                  </span>
                </Label>
                <Input
                  id="flock-young"
                  type="number"
                  min="0"
                  step="1"
                  value={values.youngCount}
                  onChange={(e) => set({ youngCount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flock-castrated" className="text-xs">
                  {ROLE_LABEL.castrated}
                  <span className="ml-1 text-muted-foreground">
                    ({birdRoleWord(values.birdType, "castrated", 2)})
                  </span>
                </Label>
                <Input
                  id="flock-castrated"
                  type="number"
                  min="0"
                  step="1"
                  value={values.castratedCount}
                  onChange={(e) => set({ castratedCount: e.target.value })}
                />
              </div>
            </div>
            {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flock-location">Location</Label>
            <Input
              id="flock-location"
              value={values.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="e.g. Back coop"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="flock-feed">Feed note</Label>
            <Input
              id="flock-feed"
              value={values.feedNote}
              onChange={(e) => set({ feedNote: e.target.value })}
              placeholder="e.g. Layers mash, morning + evening"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="flock-notes">Notes</Label>
            <Textarea
              id="flock-notes"
              rows={3}
              value={values.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Management notes, routine…"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="flock-photo-file">Photo</Label>
            <div className="flex flex-wrap items-center gap-3">
              {values.photo && (
                <img
                  src={values.photo}
                  alt="Flock photo preview"
                  className="h-24 w-24 rounded-xl border object-cover"
                />
              )}
              {values.photo && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => set({ photo: null })}
                >
                  Remove photo
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => photoFileRef.current?.click()}
              >
                <Upload className="size-4" aria-hidden />
                Upload photo
              </Button>
              <input
                ref={photoFileRef}
                id="flock-photo-file"
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose a photo file"
                onChange={handlePhotoFileChange}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Optional — stored with the record on this device; nothing is uploaded without saving.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-2 gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" className="min-h-11" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {editing ? "Save changes" : "Create flock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
