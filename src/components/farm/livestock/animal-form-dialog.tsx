"use client";

/**
 * AnimalFormDialog — create or edit an individual animal (Task 2-a).
 * Mounted only while open (parent conditionally renders it), so form state
 * is initialised fresh from the `animal` prop on every mount.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Camera, Loader2, Upload } from "lucide-react";
import { apiSend } from "@/lib/api";
import { SPECIES, from_dateInputValue, toDateInputValue } from "@/lib/farm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CameraCaptureDialog } from "@/components/farm/media/camera-capture-dialog";
import type { AnimalWithGroup } from "./livestock-helpers";
import type { LivestockGroupDTO } from "@/lib/farm";

const formSchema = z.object({
  tagId: z.string().trim().min(1, "Tag ID is required"),
  name: z.string(),
  species: z.string().min(1, "Species is required"),
  breed: z.string(),
  sex: z.string(),
  birthDate: z.string(),
  estimatedAge: z.string(),
  acquisition: z.string(),
  acquisitionDate: z.string(),
  location: z.string(),
  status: z.string().min(1, "Status is required"),
  weightKg: z
    .string()
    .refine((v) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) > 0), {
      message: "Weight must be a positive number",
    }),
  targetWeightKg: z
    .string()
    .refine((v) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) > 0), {
      message: "Target weight must be a positive number",
    }),
  notes: z.string(),
  groupId: z.string(),
  /** Data URL (camera capture or uploaded file) — stored on the record. */
  photo: z.string().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface AnimalFormDialogProps {
  /** Existing animal to edit, or null to create. */
  animal: AnimalWithGroup | null;
  groups: LivestockGroupDTO[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AnimalFormDialog({ animal, groups, onClose, onSaved }: AnimalFormDialogProps) {
  const [saving, setSaving] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(false);
  const photoFileRef = useRef<HTMLInputElement | null>(null);
  const editing = Boolean(animal);

  // SSR-safe: only offer "Take photo" where getUserMedia exists (Task r7-a).
  useEffect(() => {
    setCameraSupported(typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tagId: animal?.tagId ?? "",
      name: animal?.name ?? "",
      species: animal?.species ?? "Cattle",
      breed: animal?.breed ?? "",
      sex: animal?.sex ?? "unknown",
      birthDate: toDateInputValue(animal?.birthDate),
      estimatedAge: animal?.estimatedAge ?? "",
      acquisition: animal?.acquisition ?? "",
      acquisitionDate: toDateInputValue(animal?.acquisitionDate),
      location: animal?.location ?? "",
      status: animal?.status ?? "active",
      weightKg: animal?.weightKg != null ? String(animal.weightKg) : "",
      targetWeightKg: animal?.targetWeightKg != null ? String(animal.targetWeightKg) : "",
      notes: animal?.notes ?? "",
      groupId: animal?.groupId ?? "none",
      photo: animal?.photo ?? null,
    },
  });

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
        form.setValue("photo", reader.result, { shouldDirty: true });
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
    form.setValue("photo", dataUrl, { shouldDirty: true });
    toast.success("Photo captured");
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const payload = {
        tagId: values.tagId.trim(),
        name: values.name.trim() || null,
        species: values.species,
        breed: values.breed.trim() || null,
        sex: values.sex || null,
        birthDate: from_dateInputValue(values.birthDate),
        estimatedAge: values.estimatedAge.trim() || null,
        acquisition: values.acquisition.trim() || null,
        acquisitionDate: from_dateInputValue(values.acquisitionDate),
        location: values.location.trim() || null,
        status: values.status,
        weightKg: values.weightKg.trim() === "" ? null : Number(values.weightKg),
        targetWeightKg: values.targetWeightKg.trim() === "" ? null : Number(values.targetWeightKg),
        notes: values.notes.trim() || null,
        groupId: values.groupId === "none" ? null : values.groupId,
        photo: values.photo || null,
      };
      if (animal) {
        await apiSend(`/api/animals/${animal.id}`, "PUT", payload);
        toast.success(`${payload.tagId} updated`);
      } else {
        await apiSend("/api/animals", "POST", payload);
        toast.success(`${payload.tagId} added to your records`);
      }
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the animal");
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="farm-scroll max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${animal?.name || animal?.tagId}` : "Add animal"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this animal's profile. Changes are saved to your farm records."
              : "Record an individual animal — tag ID and species are the only required fields."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
            <FormField
              control={form.control}
              name="tagId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tag ID *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. C-042" {...field} aria-required="true" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name / nickname</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Mama" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="species"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Species *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Species">
                        <SelectValue placeholder="Select species" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SPECIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sex"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sex</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Sex">
                        <SelectValue placeholder="Select sex" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="breed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Breed</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Local × Brahman" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                      <SelectItem value="deceased">Deceased</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="birthDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of birth</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>If unknown, use an estimated age instead.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="estimatedAge"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated age</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. about 2 years" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="weightKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Weight (kg)</FormLabel>
                  <FormControl>
                    <Input type="number" step="any" min="0" placeholder="e.g. 420" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="targetWeightKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target weight (kg)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 480"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Optional goal — drawn on the growth chart.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location / paddock</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. River paddock" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="acquisition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Acquisition source</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Born on farm / Chisamba market" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="acquisitionDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Acquisition date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="groupId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Group / herd</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full" aria-label="Group">
                        <SelectValue placeholder="Select a group" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No group</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name} ({g.species})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="photo"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Photo</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap items-center gap-3">
                      {field.value && (
                        <span className="relative inline-flex">
                          <img
                            src={field.value}
                            alt="Animal photo preview"
                            className="h-24 w-24 rounded-xl border object-cover"
                          />
                        </span>
                      )}
                      {field.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11"
                          onClick={() => field.onChange(null)}
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
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        tabIndex={-1}
                        aria-label="Choose a photo file"
                        onChange={handlePhotoFileChange}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Optional — stored with the record on this device; nothing is uploaded without
                    saving.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Temperament, health notes, productivity…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="col-span-full mt-2 gap-2 sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" className="min-h-11" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {editing ? "Save changes" : "Add animal"}
              </Button>
            </DialogFooter>
          </form>
        </Form>

        {/* Camera capture (Task r7-a) — stream is started/stopped with this dialog. */}
        <CameraCaptureDialog
          open={cameraOpen}
          onOpenChange={setCameraOpen}
          onCapture={handlePhotoCaptured}
        />
      </DialogContent>
    </Dialog>
  );
}
