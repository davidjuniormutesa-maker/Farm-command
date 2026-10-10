"use client";

/**
 * GroupDetailDialog — herd/flock profile, linked animals and health timeline (Task 2-a).
 * Animals are read from the shared qk.animals cache (single fetch for the module).
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Loader2, Pencil, Plus, Syringe, Trash2, Users } from "lucide-react";
import { apiGet, apiSend, qk } from "@/lib/api";
import { formatDate, titleCase, groupRoleSummary } from "@/lib/farm";
import type { LivestockGroupDTO } from "@/lib/farm";
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
import { Skeleton } from "@/components/ui/skeleton";
import type { AnimalWithGroup, FormTarget, HealthEventWithRefs, VaccinationWithRefs } from "./livestock-helpers";
import { SpeciesAvatar, animalStatusBadgeClass } from "./livestock-helpers";
import Timeline from "./timeline";

interface GroupDetailDialogProps {
  groupId: string;
  onClose: () => void;
  onEdit: (group: LivestockGroupDTO) => void;
  onRecordHealth: (target: FormTarget) => void;
  onRecordVaccination: (target: FormTarget) => void;
  onEditHealth: (event: HealthEventWithRefs) => void;
  onEditVaccination: (vaccination: VaccinationWithRefs) => void;
  onOpenAnimal: (animalId: string) => void;
}

export default function GroupDetailDialog({
  groupId,
  onClose,
  onEdit,
  onRecordHealth,
  onRecordVaccination,
  onEditHealth,
  onEditVaccination,
  onOpenAnimal,
}: GroupDetailDialogProps) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  const { data: group, isLoading } = useQuery({
    queryKey: [...qk.groups, groupId],
    queryFn: () => apiGet<LivestockGroupDTO>(`/api/groups/${groupId}`),
  });
  const { data: animals } = useQuery({
    queryKey: qk.animals,
    queryFn: () => apiGet<AnimalWithGroup[]>("/api/animals"),
  });

  const members = useMemo(
    () => (animals ?? []).filter((a) => a.groupId === groupId),
    [animals, groupId]
  );

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
    if (!group) return;
    setDeleting(true);
    try {
      await apiSend(`/api/groups/${group.id}`, "DELETE");
      toast.success(`Group "${group.name}" deleted`, {
        description: "Its health records were removed; animals stay in your records ungrouped.",
      });
      invalidateAll();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the group");
    } finally {
      setDeleting(false);
    }
  };

  const target: FormTarget | null = group ? { groupId: group.id, animalId: null, label: group.name } : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="farm-scroll max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          {isLoading || !group ? (
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-xl" />
              <div className="space-y-2">
                <DialogTitle className="sr-only">Loading group…</DialogTitle>
                <DialogDescription className="sr-only">Group profile is loading.</DialogDescription>
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 pr-8">
              <SpeciesAvatar species={group.species} className="size-12" />
              <div className="min-w-0">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                  <span className="truncate">{group.name}</span>
                  <Badge variant="secondary" className="text-[11px]">
                    {group.count} head
                  </Badge>
                  {group.status === "archived" && (
                    <Badge variant="outline" className={`text-[11px] ${animalStatusBadgeClass("archived")}`}>
                      Archived
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  {group.species}
                  {group.breed ? ` · ${group.breed}` : ""}
                  {group.location ? ` · ${group.location}` : ""}
                </DialogDescription>
              </div>
            </div>
          )}
        </DialogHeader>

        {isLoading || !group ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Profile */}
            <div className="rounded-xl border bg-muted/20 p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                <Detail label="Species" value={group.species} />
                <Detail label="Breed" value={group.breed || "—"} />
                <Detail label="Count" value={`${group.count} head`} />
                <Detail label="Location" value={group.location || "—"} />
                <Detail label="Acquisition" value={group.acquisition || "—"} />
                <Detail label="Created" value={formatDate(group.createdAt)} />
              </dl>
              {groupRoleSummary(group) && (
                <p className="mt-3 text-xs font-medium leading-relaxed">{groupRoleSummary(group)}</p>
              )}
              {group.notes && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{group.notes}</p>}
            </div>

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
              <Button variant="outline" className="min-h-11" onClick={() => onEdit(group)}>
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
                    <AlertDialogTitle>Delete group "{group.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the group and its group-level health records. Individual animals stay
                      in your records (ungrouped) and open reminder tasks from its vaccinations are cleaned up.
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

            {/* Linked animals */}
            <section aria-label="Animals in this group">
              <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                <Users className="size-4 text-muted-foreground" aria-hidden />
                Animals in this group
                <Badge variant="secondary" className="ml-0.5">{members.length}</Badge>
              </h3>
              {members.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
                  No individual animals are linked to this group yet — edit an animal and choose this group.
                </p>
              ) : (
                <div className="farm-scroll max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {members.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onOpenAnimal(a.id)}
                      className="flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                      aria-label={`Open ${a.name || a.tagId}`}
                    >
                      <SpeciesAvatar species={a.species} className="size-8 rounded-lg text-base" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name || a.tagId}</p>
                        <p className="truncate text-[11px] text-muted-foreground">Tag {a.tagId}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${animalStatusBadgeClass(a.status)}`}>
                        {titleCase(a.status)}
                      </Badge>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* History */}
            <section aria-label="History">
              <h3 className="mb-2.5 text-sm font-semibold tracking-tight">History</h3>
              <Timeline
                groupId={group.id}
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
