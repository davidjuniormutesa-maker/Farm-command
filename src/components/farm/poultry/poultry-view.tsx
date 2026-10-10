"use client";

/**
 * Poultry view — dedicated section for flocks and their daily egg collection.
 * Default export, no props. Wired into the app shell via the Zustand store.
 *
 * Quick action: "add-flock" opens the flock form (derived during render — no
 * setState in effects) and is consumed on close.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bird, Egg, MapPin, Plus, Search } from "lucide-react";
import { apiGet, qk } from "@/lib/api";
import {
  BIRD_TYPES,
  BIRD_TYPE_EMOJI,
  flockRoleSummary,
  statusBadgeClass,
  titleCase,
} from "@/lib/farm";
import type { PoultryFlockDTO } from "@/lib/farm";
import { useFarmStore } from "@/components/farm/store";
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
import PoultryFlockFormDialog from "./poultry-flock-form-dialog";
import PoultryFlockDetailDialog from "./poultry-flock-detail-dialog";

export default function PoultryView() {
  const queryClient = useQueryClient();
  const quickAction = useFarmStore((s) => s.quickAction);
  const consumeQuickAction = useFarmStore((s) => s.consumeQuickAction);

  const flocksQuery = useQuery({
    queryKey: qk.poultry,
    queryFn: () => apiGet<PoultryFlockDTO[]>("/api/poultry"),
  });
  const flocks = useMemo(() => flocksQuery.data ?? [], [flocksQuery.data]);

  // ---------- Filters ----------
  const [search, setSearch] = useState("");
  const [birdFilter, setBirdFilter] = useState("all");

  const filteredFlocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flocks.filter((f) => {
      if (birdFilter !== "all" && f.birdType !== birdFilter) return false;
      if (q && !`${f.name} ${f.breed ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [flocks, search, birdFilter]);

  const totals = useMemo(() => {
    const birds = flocks.reduce((sum, f) => sum + (f.count || 0), 0);
    return { flocks: flocks.length, birds };
  }, [flocks]);

  // ---------- Dialog orchestration ----------
  const [formFlock, setFormFlock] = useState<PoultryFlockDTO | null | undefined>(undefined); // undefined = closed
  const [detailId, setDetailId] = useState<string | null>(null);

  // Quick action is DERIVED during render (no setState in effects).
  const forcedOpen = quickAction === "add-flock";
  const formOpen = formFlock !== undefined || forcedOpen;
  const editingFlock = formFlock ?? null;

  const openCreate = () => setFormFlock(null);
  const openEdit = (flock: PoultryFlockDTO) => setFormFlock(flock);
  const closeForm = () => {
    setFormFlock(undefined);
    if (forcedOpen && quickAction === "add-flock") consumeQuickAction();
  };

  const invalidateAll = () => {
    for (const key of [qk.poultry, qk.eggs, qk.summary, qk.dashboard]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const loading = flocksQuery.isLoading;

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
              <Bird className="size-5" />
            </span>
            Poultry
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chickens, ducks, quail, turkeys and geese — flocks and daily egg collection in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={openCreate}>
            <Plus className="size-4" aria-hidden />
            Add Flock
          </Button>
        </div>
      </div>

      {/* ---------- Quick stats ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Flocks</p>
          <p className="text-2xl font-bold">{totals.flocks}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Birds (total)</p>
          <p className="text-2xl font-bold">{totals.birds}</p>
        </div>
      </div>

      {/* ---------- Filters ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flocks…"
            className="pl-9"
            aria-label="Search flocks"
          />
        </div>
        <Select value={birdFilter} onValueChange={setBirdFilter}>
          <SelectTrigger className="w-44" aria-label="Filter by bird type">
            <SelectValue placeholder="All bird types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bird types</SelectItem>
            {BIRD_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {BIRD_TYPE_EMOJI[t]} {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ---------- Flock cards ---------- */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filteredFlocks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-3xl" aria-hidden>
              🐔
            </span>
            <div>
              <p className="font-medium">
                {flocks.length === 0 ? "No flocks yet" : "No flocks match your filters"}
              </p>
              <p className="text-sm text-muted-foreground">
                {flocks.length === 0
                  ? "Add your first flock to start logging eggs."
                  : "Try a different search or bird type."}
              </p>
            </div>
            {flocks.length === 0 && (
              <Button className="min-h-11" onClick={openCreate}>
                <Plus className="size-4" aria-hidden />
                Add Flock
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFlocks.map((flock) => {
            const roleSummary = flockRoleSummary(flock);
            return (
              <Card
                key={flock.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailId(flock.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailId(flock.id);
                  }
                }}
                className="cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted/40 text-2xl" aria-hidden>
                    {flock.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={flock.photo} alt="" className="size-11 rounded-xl object-cover" />
                    ) : (
                      BIRD_TYPE_EMOJI[flock.birdType] ?? "\uD83D\uDC26"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">{flock.name}</CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{flock.birdType}</Badge>
                      {flock.breed && <span className="truncate text-muted-foreground">{flock.breed}</span>}
                    </CardDescription>
                  </div>
                  {flock.status && flock.status !== "active" && (
                    <Badge className={statusBadgeClass(flock.status)}>{titleCase(flock.status)}</Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="font-medium">
                    {flock.count} bird{flock.count === 1 ? "" : "s"}
                  </p>
                  {roleSummary && <p className="text-xs text-muted-foreground">{roleSummary}</p>}
                  {flock.location && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden />
                      {flock.location}
                    </p>
                  )}
                  <p className="flex items-center gap-1 pt-1 text-xs font-medium text-primary">
                    <Egg className="size-3.5" aria-hidden />
                    Tap to log eggs
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------- Dialogs ---------- */}
      {formOpen && (
        <PoultryFlockFormDialog
          flock={editingFlock}
          onClose={closeForm}
          onSaved={invalidateAll}
        />
      )}
      {detailId && (
        <PoultryFlockDetailDialog
          flockId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(flock) => {
            setDetailId(null);
            openEdit(flock);
          }}
        />
      )}
    </div>
  );
}
