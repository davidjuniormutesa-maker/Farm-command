"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LandPlot, Scissors, Sprout, Wheat } from "lucide-react";
import { apiGet, qk } from "@/lib/api";
import { useFarmStore } from "@/components/farm/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CropCycleCard } from "./crop-cycle-card";
import { CropCycleDetailDialog } from "./crop-cycle-detail-dialog";
import { CropCycleFormDialog } from "./crop-cycle-form-dialog";
import { EmptyState } from "./shared";
import { FieldCard } from "./field-card";
import { FieldDetailDialog } from "./field-detail-dialog";
import { FieldFormDialog } from "./field-form-dialog";
import { RecordHarvestDialog } from "./record-harvest-dialog";
import type { CropCycleWithField, FieldWithCycles } from "./types";

type CropsTab = "fields" | "cycles";

function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="rounded-xl p-4">
          <CardContent className="space-y-3 p-0">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Crops & Fields module: field management, crop cycles, harvests and the activity log. */
export default function CropsView() {
  const qc = useQueryClient();
  const quickAction = useFarmStore((s) => s.quickAction);
  const consumeQuickAction = useFarmStore((s) => s.consumeQuickAction);

  const [tab, setTab] = useState<CropsTab>("fields");

  // Dialog state — detail dialogs hold their entity while mounted.
  const [fieldFormOpen, setFieldFormOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldWithCycles | null>(null);
  const [detailField, setDetailField] = useState<FieldWithCycles | null>(null);

  const [cycleFormOpen, setCycleFormOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<CropCycleWithField | null>(null);
  const [detailCycle, setDetailCycle] = useState<CropCycleWithField | null>(null);

  const [harvestCycle, setHarvestCycle] = useState<CropCycleWithField | null>(null);
  const [pickHarvestOpen, setPickHarvestOpen] = useState(false);
  const [pickHarvestId, setPickHarvestId] = useState<string | null>(null);

  const fieldsQuery = useQuery({
    queryKey: qk.fields,
    queryFn: () => apiGet<FieldWithCycles[]>("/api/fields"),
  });
  const cropsQuery = useQuery({
    queryKey: qk.crops,
    queryFn: () => apiGet<CropCycleWithField[]>("/api/crops"),
  });

  const fields = useMemo(() => fieldsQuery.data ?? [], [fieldsQuery.data]);

  // Active cycles first, newest within each group.
  const cycles = useMemo(() => {
    const list = [...(cropsQuery.data ?? [])];
    const rank = (s: string) => (s === "growing" ? 0 : s === "planned" ? 1 : s === "harvested" ? 2 : 3);
    const time = (c: CropCycleWithField) =>
      new Date(c.plantingDate ?? c.createdAt).getTime() || 0;
    list.sort((a, b) => rank(a.status) - rank(b.status) || time(b) - time(a));
    return list;
  }, [cropsQuery.data]);

  const harvestableCycles = useMemo(
    () => cycles.filter((c) => c.status === "growing" || c.status === "planned"),
    [cycles]
  );

  // ---- Quick actions ("add-field", "add-crop", "record-harvest") ----
  useEffect(() => {
    if (!quickAction) return;
    const action = quickAction;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = (attempt: number) => {
      timer = setTimeout(() => {
        if (action === "add-field") {
          setEditingField(null);
          setFieldFormOpen(true);
        } else if (action === "add-crop") {
          setEditingCycle(null);
          setCycleFormOpen(true);
        } else if (action === "record-harvest") {
          setTab("cycles");
          const state = qc.getQueryState(qk.crops);
          const data = qc.getQueryData<CropCycleWithField[]>(qk.crops);
          if (!data && state?.status === "pending" && attempt < 10) {
            run(attempt + 1); // give the crop cycles query a moment to land
            return;
          }
          const harvestable = (data ?? []).filter(
            (c) => c.status === "growing" || c.status === "planned"
          );
          if (harvestable.length === 1) {
            setHarvestCycle(harvestable[0]);
          } else if (harvestable.length > 1) {
            setPickHarvestId(null);
            setPickHarvestOpen(true);
          } else {
            toast.info("No growing crops to harvest yet. Start a crop cycle first.");
          }
        }
        consumeQuickAction();
      }, attempt === 0 ? 0 : 200);
    };
    run(0);

    return () => clearTimeout(timer);
  }, [quickAction, consumeQuickAction, qc]);

  const openFieldCreate = () => {
    setEditingField(null);
    setFieldFormOpen(true);
  };
  const openCycleCreate = () => {
    setEditingCycle(null);
    setCycleFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Crops &amp; Fields</h2>
          <p className="text-sm text-muted-foreground">
            Manage your fields, follow every crop from planting to sale, and keep the activity log up to date.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11 gap-1.5" onClick={openFieldCreate}>
            <LandPlot className="size-4" aria-hidden />
            Add Field
          </Button>
          <Button className="min-h-11 gap-1.5" onClick={openCycleCreate}>
            <Sprout className="size-4" aria-hidden />
            New Crop Cycle
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as CropsTab)}>
        <TabsList className="h-11">
          <TabsTrigger value="fields" className="min-h-11 gap-2 px-4">
            <LandPlot className="size-4" aria-hidden />
            Fields
            <span className="rounded-full bg-muted px-1.5 text-xs font-semibold">
              {fieldsQuery.isLoading ? "…" : fields.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="cycles" className="min-h-11 gap-2 px-4">
            <Wheat className="size-4" aria-hidden />
            Crop Cycles
            <span className="rounded-full bg-muted px-1.5 text-xs font-semibold">
              {cropsQuery.isLoading ? "…" : cycles.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ---- Fields tab ---- */}
        <TabsContent value="fields" className="mt-5">
          {fieldsQuery.isLoading ? (
            <CardsSkeleton />
          ) : fields.length === 0 ? (
            <EmptyState
              icon={LandPlot}
              title="No fields yet"
              description="Add the plots you farm — size, location and soil notes — so crop cycles and records stay organised."
              actionLabel="Add Field"
              onAction={openFieldCreate}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fields.map((f) => (
                <FieldCard
                  key={f.id}
                  field={f}
                  onOpen={setDetailField}
                  onEdit={(field) => {
                    setDetailField(null);
                    setEditingField(field);
                    setFieldFormOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- Crop cycles tab ---- */}
        <TabsContent value="cycles" className="mt-5">
          {cropsQuery.isLoading ? (
            <CardsSkeleton />
          ) : cycles.length === 0 ? (
            <EmptyState
              icon={Sprout}
              title="No crop cycles yet"
              description="Start a crop cycle to track a crop from planting through growth, harvest and sale — maize, soybeans, vegetables and more."
              actionLabel="New Crop Cycle"
              onAction={openCycleCreate}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cycles.map((c) => (
                <CropCycleCard
                  key={c.id}
                  cycle={c}
                  onOpen={setDetailCycle}
                  onEdit={(cycle) => {
                    setEditingCycle(cycle);
                    setCycleFormOpen(true);
                  }}
                  onRecordHarvest={setHarvestCycle}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ---- Dialogs ---- */}
      {fieldFormOpen && (
        <FieldFormDialog
          key={editingField?.id ?? "new-field"}
          open
          onOpenChange={(o) => {
            if (!o) {
              setFieldFormOpen(false);
              setEditingField(null);
            }
          }}
          field={editingField}
        />
      )}

      {cycleFormOpen && (
        <CropCycleFormDialog
          key={editingCycle?.id ?? "new-cycle"}
          open
          onOpenChange={(o) => {
            if (!o) {
              setCycleFormOpen(false);
              setEditingCycle(null);
            }
          }}
          cycle={editingCycle}
          fields={fields}
        />
      )}

      {detailField && (
        <FieldDetailDialog
          key={detailField.id}
          field={detailField}
          crops={cycles}
          onOpenChange={(o) => {
            if (!o) setDetailField(null);
          }}
          onEdit={(field) => {
            setDetailField(null);
            const fresh = fields.find((f) => f.id === field.id);
            setEditingField(fresh ?? { ...field, cropCycles: [] });
            setFieldFormOpen(true);
          }}
        />
      )}

      {detailCycle && (
        <CropCycleDetailDialog
          key={detailCycle.id}
          cycle={detailCycle}
          onOpenChange={(o) => {
            if (!o) setDetailCycle(null);
          }}
        />
      )}

      {harvestCycle && (
        <RecordHarvestDialog
          key={harvestCycle.id}
          open
          onOpenChange={(o) => {
            if (!o) setHarvestCycle(null);
          }}
          cycle={harvestCycle}
        />
      )}

      {/* Small picker used when several cycles are ready for the record-harvest quick action */}
      <Dialog
        open={pickHarvestOpen}
        onOpenChange={(o) => {
          setPickHarvestOpen(o);
          if (!o) setPickHarvestId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="size-5 text-primary" aria-hidden />
              Which crop did you harvest?
            </DialogTitle>
            <DialogDescription>
              More than one crop is ready — pick the one you brought in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pick-harvest">Growing crop</Label>
            <Select value={pickHarvestId ?? harvestableCycles[0]?.id ?? ""} onValueChange={setPickHarvestId}>
              <SelectTrigger id="pick-harvest" className="min-h-11 w-full">
                <SelectValue placeholder="Choose crop" />
              </SelectTrigger>
              <SelectContent>
                {harvestableCycles.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.crop}
                    {c.field?.name ? ` — ${c.field.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="min-h-11" onClick={() => setPickHarvestOpen(false)}>
              Cancel
            </Button>
            <Button
              className="min-h-11"
              onClick={() => {
                const chosen = harvestableCycles.find((c) => c.id === (pickHarvestId ?? harvestableCycles[0]?.id));
                setPickHarvestOpen(false);
                setPickHarvestId(null);
                if (chosen) setHarvestCycle(chosen);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
