"use client";

/**
 * Livestock view — animals, groups and their health/vaccination records (Task 2-a).
 * Default export, no props. Wired into the app shell via the Zustand store.
 *
 * Quick actions: "add-animal", "add-group", "add-health-event" open the matching
 * dialog (derived during render — no setState in effects) and are consumed on close.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Beef, Boxes, MapPin, Plus, Search, Stethoscope, Weight } from "lucide-react";
import { apiGet, qk } from "@/lib/api";
import {
  computeVaccinationStatus,
  formatDate,
  statusBadgeClass,
  titleCase,
  SPECIES,
  groupRoleSummary,
  type LivestockGroupDTO,
} from "@/lib/farm";
import { useFarmStore, type QuickAction } from "@/components/farm/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AnimalWithGroup,
  FormTarget,
  HealthEventWithRefs,
  VaccinationWithRefs,
} from "./livestock-helpers";
import {
  SpeciesAvatar,
  ageLabel,
  animalStatusBadgeClass,
  relativeDueLabel,
  vaccinationTargetLabel,
} from "./livestock-helpers";
import AnimalFormDialog from "./animal-form-dialog";
import GroupFormDialog from "./group-form-dialog";
import PresetPickerDialog, { type LivestockPreset } from "./preset-picker-dialog";
import HealthEventFormDialog from "./health-event-form-dialog";
import VaccinationFormDialog from "./vaccination-form-dialog";
import AnimalDetailDialog from "./animal-detail-dialog";
import GroupDetailDialog from "./group-detail-dialog";

// ---------- Local dialog state shapes ----------

type FormRequest =
  | { kind: "animal-form"; animal?: AnimalWithGroup }
  | { kind: "group-form"; group?: LivestockGroupDTO; initialSpecies?: string; initialName?: string }
  | { kind: "health-form"; target?: FormTarget; event?: HealthEventWithRefs }
  | { kind: "vac-form"; target?: FormTarget; vaccination?: VaccinationWithRefs };

type DetailRequest = { kind: "animal"; id: string } | { kind: "group"; id: string };

/** Quick action that initially forced each form kind (for consume-on-close). */
const QUICK_ACTION_FOR_KIND: Partial<Record<FormRequest["kind"], Exclude<QuickAction, null>>> = {
  "animal-form": "add-animal",
  "group-form": "add-group",
  "health-form": "add-health-event",
};

export default function LivestockView() {
  const queryClient = useQueryClient();
  const quickAction = useFarmStore((s) => s.quickAction);
  const consumeQuickAction = useFarmStore((s) => s.consumeQuickAction);
  const setView = useFarmStore((s) => s.setView);

  // Guided "what are you adding?" preset step shown before the Add-group form.
  const [presetOpen, setPresetOpen] = useState(false);

  // ---------- Data ----------
  const animalsQuery = useQuery({
    queryKey: qk.animals,
    queryFn: () => apiGet<AnimalWithGroup[]>("/api/animals"),
  });
  const groupsQuery = useQuery({
    queryKey: qk.groups,
    queryFn: () => apiGet<LivestockGroupDTO[]>("/api/groups"),
  });
  const vaccinationsQuery = useQuery({
    queryKey: qk.vaccinations,
    queryFn: () => apiGet<VaccinationWithRefs[]>("/api/vaccinations"),
  });

  const animals = useMemo(() => animalsQuery.data ?? [], [animalsQuery.data]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const vaccinations = useMemo(() => vaccinationsQuery.data ?? [], [vaccinationsQuery.data]);

  // ---------- Filters (client-side; API also supports ?status=&species=) ----------
  const [search, setSearch] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredAnimals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return animals.filter((a) => {
      if (speciesFilter !== "all" && a.species !== speciesFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (q && !`${a.tagId} ${a.name ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [animals, search, speciesFilter, statusFilter]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (speciesFilter !== "all" && g.species !== speciesFilter) return false;
      if (q && !`${g.name} ${g.breed ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [groups, search, speciesFilter]);

  // ---------- Dedicated health & vaccinations section ----------
  const reminderVaccinations = useMemo(
    () =>
      vaccinations
        .filter((v) => v.nextDueDate)
        .sort((a, b) => (a.nextDueDate! < b.nextDueDate! ? -1 : 1)),
    [vaccinations]
  );
  const overdueCount = reminderVaccinations.filter((v) => computeVaccinationStatus(v) === "Overdue").length;
  const dueSoonCount = reminderVaccinations.filter((v) => {
    const s = computeVaccinationStatus(v);
    return s === "Due today" || s === "Upcoming";
  }).length;

  // ---------- Dialog orchestration ----------
  const [form, setForm] = useState<FormRequest | null>(null);
  const [detail, setDetail] = useState<DetailRequest | null>(null);

  // Quick actions are DERIVED during render (no setState in effects): while the
  // store holds a matching quick action and no explicit form is open, the dialog shows.
  const forcedForm: FormRequest | null =
    quickAction === "add-animal"
      ? { kind: "animal-form" }
      : quickAction === "add-group"
        ? { kind: "group-form" }
        : quickAction === "add-health-event"
          ? { kind: "health-form" }
          : null;
  const activeForm = form ?? forcedForm;

  const openForm = (req: FormRequest) => setForm(req);

  const closeForm = (kind: FormRequest["kind"]) => {
    setForm(null);
    // If this form was forced by a quick action, consume it so it doesn't reopen.
    const mapped = QUICK_ACTION_FOR_KIND[kind];
    if (mapped && quickAction === mapped) consumeQuickAction();
  };

  /** Invalidate everything livestock mutations can affect (worklog convention #4). */
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

  // ---------- Render helpers ----------
  const openAnimal = (id: string) => setDetail({ kind: "animal", id });
  const openGroup = (id: string) => setDetail({ kind: "group", id });

  const loading = animalsQuery.isLoading || groupsQuery.isLoading;

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
              <Beef className="size-5" />
            </span>
            Livestock
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every animal and herd — profiles, health events and vaccinations in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => setPresetOpen(true)}>
            <Boxes className="size-4" aria-hidden />
            Add Group
          </Button>
          <Button className="min-h-11" onClick={() => openForm({ kind: "animal-form" })}>
            <Plus className="size-4" aria-hidden />
            Add Animal
          </Button>
        </div>
      </div>

      {/* ---------- Dedicated health & vaccinations section ---------- */}
      {reminderVaccinations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  aria-hidden
                >
                  <Stethoscope className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Health &amp; vaccinations</CardTitle>
                  <CardDescription>
                    {overdueCount > 0
                      ? `${overdueCount} overdue · ${dueSoonCount} coming up — reminders are created automatically`
                      : `${dueSoonCount} coming up — reminders are created automatically from next-due dates`}
                  </CardDescription>
                </div>
              </div>
              <Button variant="outline" className="min-h-11" onClick={() => openForm({ kind: "vac-form" })}>
                Record vaccination
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="farm-scroll max-h-56 divide-y overflow-y-auto rounded-lg border" role="list" aria-label="Vaccination reminders">
              {reminderVaccinations.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="listitem"
                  onClick={() => openForm({ kind: "vac-form", vaccination: v })}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent"
                  aria-label={`Edit vaccination ${v.vaccineName}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.vaccineName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {vaccinationTargetLabel(v)} · Given {formatDate(v.dateGiven)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">Next due {formatDate(v.nextDueDate)}</p>
                    <p className={`text-[11px] ${computeVaccinationStatus(v) === "Overdue" ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                      {relativeDueLabel(v.nextDueDate)}
                    </p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 ${statusBadgeClass(computeVaccinationStatus(v))}`}>
                    {computeVaccinationStatus(v)}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- Tabs ---------- */}
      <Tabs defaultValue="animals">
        <TabsList className="h-11 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="animals" className="min-h-11 gap-1.5 px-4">
            <Beef className="size-4" aria-hidden />
            Animals
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
              {animals.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="groups" className="min-h-11 gap-1.5 px-4">
            <Boxes className="size-4" aria-hidden />
            Groups
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
              {groups.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ---------- Animals tab ---------- */}
        <TabsContent value="animals" className="mt-4 space-y-4">
          {/* Filter bar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by tag ID or name…"
                className="h-11 pl-9"
                aria-label="Search animals by tag or name"
              />
            </div>
            <Select value={speciesFilter} onValueChange={setSpeciesFilter}>
              <SelectTrigger className="h-11 w-full sm:w-40" aria-label="Filter by species">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All species</SelectItem>
                {SPECIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 w-full sm:w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="deceased">Deceased</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <CardGridSkeleton />
          ) : animalsQuery.isError ? (
            <ErrorCard message="Animals could not be loaded." onRetry={() => animalsQuery.refetch()} />
          ) : animals.length === 0 ? (
            <EmptyState
              emoji="🐄"
              title="No animals recorded yet"
              description="Add your cattle, goats, poultry and more to start tracking health, vaccinations and weights for every animal on the farm."
              action={
                <Button className="mt-5 min-h-11" onClick={() => openForm({ kind: "animal-form" })}>
                  <Plus className="size-4" aria-hidden />
                  Add Animal
                </Button>
              }
            />
          ) : filteredAnimals.length === 0 ? (
            <EmptyState
              emoji="🔍"
              title="No animals match your filters"
              description="Try a different search term, species or status."
              action={
                <Button variant="outline" className="mt-5 min-h-11" onClick={() => { setSearch(""); setSpeciesFilter("all"); setStatusFilter("all"); }}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredAnimals.map((a) => (
                <AnimalCard key={a.id} animal={a} onOpen={() => openAnimal(a.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------- Groups tab ---------- */}
        <TabsContent value="groups" className="mt-4 space-y-4">
          {loading ? (
            <CardGridSkeleton />
          ) : groupsQuery.isError ? (
            <ErrorCard message="Groups could not be loaded." onRetry={() => groupsQuery.refetch()} />
          ) : groups.length === 0 ? (
            <EmptyState
              emoji="🐐"
              title="No groups yet"
              description="Group your herd or flock — then record health events and vaccinations for many animals at once."
              action={
                <Button className="mt-5 min-h-11" onClick={() => setPresetOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  Add Group
                </Button>
              }
            />
          ) : filteredGroups.length === 0 ? (
            <EmptyState
              emoji="🔍"
              title="No groups match your filters"
              description="Try a different search term or species."
              action={
                <Button variant="outline" className="mt-5 min-h-11" onClick={() => { setSearch(""); setSpeciesFilter("all"); }}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredGroups.map((g) => (
                <GroupCard key={g.id} group={g} onOpen={() => openGroup(g.id)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- Detail dialogs ---------- */}
      {detail?.kind === "animal" && (
        <AnimalDetailDialog
          key={detail.id}
          animalId={detail.id}
          onClose={() => setDetail(null)}
          onEdit={(animal) => openForm({ kind: "animal-form", animal })}
          onRecordHealth={(target) => openForm({ kind: "health-form", target })}
          onRecordVaccination={(target) => openForm({ kind: "vac-form", target })}
          onEditHealth={(event) => openForm({ kind: "health-form", event })}
          onEditVaccination={(vaccination) => openForm({ kind: "vac-form", vaccination })}
        />
      )}
      {detail?.kind === "group" && (
        <GroupDetailDialog
          key={detail.id}
          groupId={detail.id}
          onClose={() => setDetail(null)}
          onEdit={(group) => openForm({ kind: "group-form", group })}
          onRecordHealth={(target) => openForm({ kind: "health-form", target })}
          onRecordVaccination={(target) => openForm({ kind: "vac-form", target })}
          onEditHealth={(event) => openForm({ kind: "health-form", event })}
          onEditVaccination={(vaccination) => openForm({ kind: "vac-form", vaccination })}
          onOpenAnimal={openAnimal}
        />
      )}

      {/* ---------- Form dialogs (mounted only while open) ---------- */}
      {activeForm?.kind === "animal-form" && (
        <AnimalFormDialog
          key={activeForm.animal?.id ?? "new-animal"}
          animal={activeForm.animal ?? null}
          groups={groups}
          onClose={() => closeForm("animal-form")}
          onSaved={invalidateAll}
        />
      )}
      {activeForm?.kind === "group-form" && (
        <GroupFormDialog
          key={activeForm.group?.id ?? `new-group-${activeForm.initialSpecies ?? ""}`}
          group={activeForm.group ?? null}
          initialSpecies={activeForm.initialSpecies}
          initialName={activeForm.initialName}
          onClose={() => closeForm("group-form")}
          onSaved={invalidateAll}
        />
      )}
      {activeForm?.kind === "health-form" && (
        <HealthEventFormDialog
          key={activeForm.event?.id ?? "new-health"}
          target={activeForm.target ?? null}
          event={activeForm.event ?? null}
          animals={animals}
          groups={groups}
          onClose={() => closeForm("health-form")}
          onSaved={invalidateAll}
        />
      )}
      {activeForm?.kind === "vac-form" && (
        <VaccinationFormDialog
          key={activeForm.vaccination?.id ?? "new-vac"}
          target={activeForm.target ?? null}
          vaccination={activeForm.vaccination ?? null}
          animals={animals}
          groups={groups}
          onClose={() => closeForm("vac-form")}
          onSaved={invalidateAll}
        />
      )}

      {/* ---------- Guided preset picker (shown before the Add-group form) ---------- */}
      <PresetPickerDialog
        open={presetOpen}
        onClose={() => setPresetOpen(false)}
        onPick={(preset: LivestockPreset) => {
          setPresetOpen(false);
          openForm({
            kind: "group-form",
            initialSpecies: preset.species,
            initialName: preset.suggestedName || undefined,
          });
        }}
        onGoToPoultry={() => {
          setPresetOpen(false);
          setView("poultry");
        }}
      />
    </div>
  );
}

// ---------- Cards ----------

function AnimalCard({ animal, onOpen }: { animal: AnimalWithGroup; onOpen: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open ${animal.name || animal.tagId}`}
      className="cursor-pointer py-4 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <CardContent className="px-4 sm:px-5">
        <div className="flex items-start gap-3">
          <SpeciesAvatar species={animal.species} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold leading-tight">{animal.name || animal.tagId}</p>
              <Badge variant="outline" className={`shrink-0 text-[10px] ${animalStatusBadgeClass(animal.status)}`}>
                {titleCase(animal.status)}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Tag {animal.tagId} · {animal.species}
              {animal.breed ? ` · ${animal.breed}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="font-medium text-foreground/70">Age</span>
            <span className="truncate">{ageLabel(animal)}</span>
          </span>
          {animal.sex && animal.sex !== "unknown" && (
            <span className="truncate">{titleCase(animal.sex)}</span>
          )}
          {animal.location && (
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{animal.location}</span>
            </span>
          )}
          {animal.weightKg != null && (
            <span className="flex items-center gap-1.5">
              <Weight className="size-3 shrink-0" aria-hidden />
              {animal.weightKg} kg
            </span>
          )}
          {animal.group?.name && (
            <span className="min-w-0 truncate sm:col-span-2">
              <span className="font-medium text-foreground/70">Group:</span> {animal.group.name}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GroupCard({ group, onOpen }: { group: LivestockGroupDTO; onOpen: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open group ${group.name}`}
      className="cursor-pointer py-4 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <CardContent className="px-4 sm:px-5">
        <div className="flex items-start gap-3">
          <SpeciesAvatar species={group.species} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-semibold leading-tight">{group.name}</p>
              <Badge variant="secondary" className="shrink-0">
                {group.count} head
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {group.species}
              {group.breed ? ` · ${group.breed}` : ""}
            </p>
          </div>
          {group.status === "archived" && (
            <Badge variant="outline" className={`shrink-0 text-[10px] ${animalStatusBadgeClass("archived")}`}>
              Archived
            </Badge>
          )}
        </div>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {groupRoleSummary(group) && (
            <p className="leading-snug text-foreground/80">{groupRoleSummary(group)}</p>
          )}
          {group.location && (
            <p className="flex items-center gap-1.5">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{group.location}</span>
            </p>
          )}
          {group.notes && <p className="line-clamp-2">{group.notes}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- States ----------

function EmptyState({
  emoji,
  title,
  description,
  action,
}: {
  emoji: string;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-14 text-center">
      <div className="mb-3 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-4xl" aria-hidden>
        {emoji}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <p className="text-sm font-medium text-destructive">{message}</p>
      <Button variant="outline" className="mt-4 min-h-11" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="py-4">
          <CardContent className="space-y-3 px-4 sm:px-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
