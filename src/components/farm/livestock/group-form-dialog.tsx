"use client";

/**
 * GroupFormDialog — create or edit a herd/flock group (Task 2-a).
 * Simple controlled form; mounted only while open so state starts fresh.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Upload } from "lucide-react";
import { apiSend } from "@/lib/api";
import { SPECIES, ROLE_LABEL, groupRoleSummary, groupRoleWord } from "@/lib/farm";
import type { LivestockGroupDTO } from "@/lib/farm";
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
import { CameraCaptureDialog } from "@/components/farm/media/camera-capture-dialog";

interface GroupFormDialogProps {
  /** Existing group to edit, or null to create. */
  group: LivestockGroupDTO | null;
  onClose: () => void;
  onSaved: () => void;
}

interface GroupFormValues {
  name: string;
  species: string;
  breed: string;
  count: string;
  breedingMaleCount: string;
  breedingFemaleCount: string;
  youngCount: string;
  castratedCount: string;
  location: string;
  acquisition: string;
  notes: string;
  /** Data URL (camera capture or uploaded file) — stored on the record. */
  photo: string | null;
}

/** Parse a form string to a non-negative whole number (blank/invalid → 0). */
function toNonNegInt(value: string): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export default function GroupFormDialog({ group, onClose, onSaved }: GroupFormDialogProps) {
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);
  const photoFileRef = useRef<HTMLInputElement | null>(null);
  const [values, setValues] = useState<GroupFormValues>({
    name: group?.name ?? "",
    species: group?.species ?? "Cattle",
    breed: group?.breed ?? "",
    count: group ? String(group.count) : "0",
    breedingMaleCount: group?.breedingMaleCount ? String(group.breedingMaleCount) : "0",
    breedingFemaleCount: group?.breedingFemaleCount ? String(group.breedingFemaleCount) : "0",
    youngCount: group?.youngCount ? String(group.youngCount) : "0",
    castratedCount: group?.castratedCount ? String(group.castratedCount) : "0",
    location: group?.location ?? "",
    acquisition: group?.acquisition ?? "",
    notes: group?.notes ?? "",
    photo: group?.photo ?? null,
  });
  const [errors, setErrors] = useState<{ name?: string; count?: string }>({});
  const editing = Boolean(group);

  // SSR-safe: only offer "Take photo" where getUserMedia exists (Task r7-a).
  useEffect(() => {
    setCameraSupported(typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const set = (patch: Partial<GroupFormValues>) => setValues((v) => ({ ...v, ...patch }));

  /** Uploaded photo file → data URL (kept exactly as the record stores it). */
  const handlePhotoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-choosing the same file later
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

  /** Camera capture → the same form state the file upload sets. */
  const handlePhotoCaptured = (dataUrl: string) => {
    set({ photo: dataUrl });
    toast.success("Photo captured");
  };

  const submit = async () => {
    const nextErrors: { name?: string; count?: string } = {};
    if (!values.name.trim()) nextErrors.name = "Group name is required";
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
        species: values.species,
        breed: values.breed.trim() || null,
        count,
        breedingMaleCount: toNonNegInt(values.breedingMaleCount),
        breedingFemaleCount: toNonNegInt(values.breedingFemaleCount),
        youngCount: toNonNegInt(values.youngCount),
        castratedCount: toNonNegInt(values.castratedCount),
        location: values.location.trim() || null,
        acquisition: values.acquisition.trim() || null,
        notes: values.notes.trim() || null,
        photo: values.photo || null,
      };
      if (group) {
        await apiSend(`/api/groups/${group.id}`, "PUT", payload);
        toast.success(`Group "${payload.name}" updated`);
      } else {
        await apiSend("/api/groups", "POST", payload);
        toast.success(`Group "${payload.name}" created`);
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${group?.name}` : "Add group"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this herd or flock."
              : "A group lets you record health events and vaccinations for a whole herd or flock at once."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Group name *</Label>
            <Input
              id="group-name"
              value={values.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Main cattle herd"
              aria-required="true"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-species">Species *</Label>
            <Select value={values.species} onValueChange={(v) => set({ species: v })}>
              <SelectTrigger id="group-species" className="w-full" aria-label="Species">
                <SelectValue placeholder="Select species" />
              </SelectTrigger>
              <SelectContent>
                {SPECIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-breed">Breed</Label>
            <Input
              id="group-breed"
              value={values.breed}
              onChange={(e) => set({ breed: e.target.value })}
              placeholder="e.g. Small East African"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-count">Count (head)</Label>
            <Input
              id="group-count"
              type="number"
              min="0"
              step="1"
              value={values.count}
              onChange={(e) => set({ count: e.target.value })}
              aria-invalid={Boolean(errors.count)}
            />
            {errors.count && <p className="text-xs text-destructive">{errors.count}</p>}
          </div>

          {/* Optional simple role breakdown (patriarchs / matriarchs / young / castrated). */}
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3 sm:col-span-2">
            <p className="text-sm font-medium">Breakdown (optional)</p>
            <p className="text-xs text-muted-foreground">
              How many of each kind. Leave as 0 if you don&apos;t track this.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="group-breeding-male" className="text-xs">
                  {ROLE_LABEL.breedingMale}
                  <span className="ml-1 text-muted-foreground">
                    ({groupRoleWord(values.species, "breedingMale", 2)})
                  </span>
                </Label>
                <Input
                  id="group-breeding-male"
                  type="number"
                  min="0"
                  step="1"
                  value={values.breedingMaleCount}
                  onChange={(e) => set({ breedingMaleCount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-breeding-female" className="text-xs">
                  {ROLE_LABEL.breedingFemale}
                  <span className="ml-1 text-muted-foreground">
                    ({groupRoleWord(values.species, "breedingFemale", 2)})
                  </span>
                </Label>
                <Input
                  id="group-breeding-female"
                  type="number"
                  min="0"
                  step="1"
                  value={values.breedingFemaleCount}
                  onChange={(e) => set({ breedingFemaleCount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-young" className="text-xs">
                  {ROLE_LABEL.young}
                  <span className="ml-1 text-muted-foreground">
                    ({groupRoleWord(values.species, "young", 2)})
                  </span>
                </Label>
                <Input
                  id="group-young"
                  type="number"
                  min="0"
                  step="1"
                  value={values.youngCount}
                  onChange={(e) => set({ youngCount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-castrated" className="text-xs">
                  {ROLE_LABEL.castrated}
                  <span className="ml-1 text-muted-foreground">
                    ({groupRoleWord(values.species, "castrated", 2)})
                  </span>
                </Label>
                <Input
                  id="group-castrated"
                  type="number"
                  min="0"
                  step="1"
                  value={values.castratedCount}
                  onChange={(e) => set({ castratedCount: e.target.value })}
                />
              </div>
            </div>
            {groupRoleSummary({
              species: values.species,
              breedingMaleCount: toNonNegInt(values.breedingMaleCount),
              breedingFemaleCount: toNonNegInt(values.breedingFemaleCount),
              youngCount: toNonNegInt(values.youngCount),
              castratedCount: toNonNegInt(values.castratedCount),
            }) && (
              <p className="text-xs text-muted-foreground">
                {groupRoleSummary({
                  species: values.species,
                  breedingMaleCount: toNonNegInt(values.breedingMaleCount),
                  breedingFemaleCount: toNonNegInt(values.breedingFemaleCount),
                  youngCount: toNonNegInt(values.youngCount),
                  castratedCount: toNonNegInt(values.castratedCount),
                })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-location">Location</Label>
            <Input
              id="group-location"
              value={values.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="e.g. Hill paddock"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-acquisition">Acquisition</Label>
            <Input
              id="group-acquisition"
              value={values.acquisition}
              onChange={(e) => set({ acquisition: e.target.value })}
              placeholder="e.g. Local market"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="group-notes">Notes</Label>
            <Textarea
              id="group-notes"
              rows={3}
              value={values.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Management notes, feeding routine…"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="group-photo-file">Photo</Label>
            <div className="flex flex-wrap items-center gap-3">
              {values.photo && (
                <img
                  src={values.photo}
                  alt="Group photo preview"
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
              {cameraSupported && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera className="size-4" aria-hidden />
                  Take photo
                </Button>
              )}
              <input
                ref={photoFileRef}
                id="group-photo-file"
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
            {editing ? "Save changes" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Camera capture (Task r7-a) — stream is started/stopped with this dialog. */}
      <CameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={handlePhotoCaptured}
      />
    </Dialog>
  );
}
