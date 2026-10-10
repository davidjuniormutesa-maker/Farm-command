"use client";

/**
 * AnimalDetailDialog — full profile + history timeline for one animal (Task 2-a).
 * Data is queried by id (cache key under qk.animals) so edits stay in sync.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Syringe, Trash2 } from "lucide-react";
import { apiGet, apiSend, qk } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/farm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnimalWithGroup, FormTarget, HealthEventWithRefs, VaccinationWithRefs } from "./livestock-helpers";
import { SpeciesAvatar, ageLabel, animalStatusBadgeClass } from "./livestock-helpers";
import Timeline from "./timeline";
import WeightHistorySection from "./weight-history-section";
import BreedingSection from "./breeding-section";

interface AnimalDetailDialogProps {
  animalId: string;
  onClose: () => void;
  onEdit: (animal: AnimalWithGroup) => void;
  onRecordHealth: (target: FormTarget) => void;
  onRecordVaccination: (target: FormTarget) => void;
  onEditHealth: (event: HealthEventWithRefs) => void;
  onEditVaccination: (vaccination: VaccinationWithRefs) => void;
}

export default function AnimalDetailDialog({
  animalId,
  onClose,
  onEdit,
  onRecordHealth,
  onRecordVaccination,
  onEditHealth,
  onEditVaccination,
}: AnimalDetailDialogProps) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const { data: animal, isLoading } = useQuery({
    queryKey: [...qk.animals, animalId],
    queryFn: () => apiGet<AnimalWithGroup>(`/api/animals/${animalId}`),
  });

  /** Invalidate everything a livestock mutation can affect (see worklog convention #4). */
  const invalidateAll = () => {
    for (const key of [
      qk.animals,
      qk.groups,
      qk.healthEvents,
      qk.vaccinations,
      qk.tasks,
      qk.summary,
      qk.dashboard,
      qk.livestock,
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const remove = async () => {
    if (!animal) return;
    setDeleting(true);
    try {
      await apiSend(`/api/animals/${animal.id}`, "DELETE");
      toast.success(`${animal.tagId} deleted`, {
        description: "Its health records were removed and linked tasks were cleaned up.",
      });
      invalidateAll();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the animal");
    } finally {
      setDeleting(false);
    }
  };

  const target: FormTarget | null = animal
    ? { animalId: animal.id, groupId: null, label: animal.name ? `${animal.tagId} · ${animal.name}` : animal.tagId }
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="farm-scroll max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          {isLoading || !animal ? (
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-xl" />
              <div className="space-y-2">
                <DialogTitle className="sr-only">Loading animal…</DialogTitle>
                <DialogDescription className="sr-only">Animal profile is loading.</DialogDescription>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 pr-8">
              <SpeciesAvatar species={animal.species} className="size-12" />
              <div className="min-w-0">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                  <span className="truncate">{animal.name || animal.tagId}</span>
                  <Badge variant="outline" className={`text-[11px] ${animalStatusBadgeClass(animal.status)}`}>
                    {titleCase(animal.status)}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  Tag {animal.tagId} · {animal.species}
                  {animal.breed ? ` · ${animal.breed}` : ""}
                </DialogDescription>
              </div>
            </div>
          )}
        </DialogHeader>

        {isLoading || !animal ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Profile */}
            <div className="rounded-xl border bg-muted/20 p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                <Detail label="Tag ID" value={animal.tagId} mono />
                <Detail label="Sex" value={animal.sex ? titleCase(animal.sex) : "—"} />
                <Detail label="Age" value={ageLabel(animal)} />
                <Detail label="Born" value={formatDate(animal.birthDate)} />
                <Detail label="Weight" value={animal.weightKg != null ? `${animal.weightKg} kg` : "—"} />
                <Detail
                  label="Target"
                  value={
                    animal.targetWeightKg != null
                      ? `${animal.targetWeightKg} kg${
                          animal.weightKg != null && animal.targetWeightKg > animal.weightKg
                            ? ` · ${Number((animal.targetWeightKg - animal.weightKg).toFixed(1))} to go`
                            : animal.weightKg != null && animal.weightKg >= animal.targetWeightKg
                              ? " · reached"
                              : ""
                        }`
                      : "—"
                  }
                />
                <Detail label="Location" value={animal.location || "—"} />
                <Detail label="Acquired" value={animal.acquisition || "—"} />
                <Detail label="Acquired on" value={formatDate(animal.acquisitionDate)} />
                <Detail label="Group" value={animal.group?.name || "—"} />
              </dl>
              {animal.notes && (
                <>
                  <Separator className="my-3" />
                  <p className="text-xs leading-relaxed text-muted-foreground">{animal.notes}</p>
                </>
              )}
            </div>

            {/* Weight history + growth chart */}
            <WeightHistorySection animal={animal} />

            {/* Breeding & gestation tracker (r5) */}
            <BreedingSection
              animal={animal}
              onLogEvent={(defaultType) => target && onRecordHealth({ ...target, defaultType })}
            />

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11 flex-1 sm:flex-none" onClick={() => target && onRecordVaccination(target)}>
                <Syringe className="size-4" aria-hidden />
                Record vaccination
              </Button>
              <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => target && onRecordHealth(target)}>
                <Plus className="size-4" aria-hidden />
                Record health event
              </Button>
              <Button variant="outline" className="min-h-11" onClick={() => onEdit(animal)}>
                <Pencil className="size-4" aria-hidden />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="min-h-11 text-destructive hover:text-destructive" disabled={deleting}>
                    <Trash2 className="size-4" aria-hidden />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {animal.name || animal.tagId}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the animal together with its health events, vaccinations and weight
                      records. Linked open reminder tasks are cleaned up too. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={(e) => {
                        e.preventDefault();
                        remove();
                      }}
                    >
                      {deleting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                      Delete permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* History */}
            <section aria-label="History">
              <h3 className="mb-2.5 text-sm font-semibold tracking-tight">History</h3>
              <Timeline
                animalId={animal.id}
                onEditHealth={onEditHealth}
                onEditVaccination={onEditVaccination}
                onChanged={invalidateAll}
              />
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`truncate font-medium ${mono ? "font-mono text-[13px]" : ""}`}>{value}</dd>
    </div>
  );
}
