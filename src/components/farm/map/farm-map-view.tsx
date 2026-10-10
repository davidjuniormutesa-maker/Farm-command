"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Fence, LayoutGrid, Map as MapIcon, Mountain,
  Plus, Scissors, SquarePen, Sprout, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, qk } from "@/lib/api";
import { useFarmStore } from "@/components/farm/store";
import type { FieldDTO } from "@/lib/farm";

// ---------- Types & kind styling ----------

interface MapItemDTO {
  id: string;
  kind: "field" | "paddock" | "building" | "water" | "gate" | "road" | "other" | string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string | null;
  notes?: string | null;
}

const KIND_META: Record<string, { label: string; icon: string; cls: string; dot: string }> = {
  field: { label: "Field / plot", icon: "🌾", cls: "bg-emerald-200/85 border-emerald-500/60 text-emerald-950 hover:bg-emerald-200", dot: "bg-emerald-500" },
  paddock: { label: "Paddock / pen", icon: "🐄", cls: "bg-lime-200/85 border-lime-500/60 text-lime-950 hover:bg-lime-200", dot: "bg-lime-500" },
  building: { label: "Building", icon: "🏠", cls: "bg-amber-200/85 border-amber-500/60 text-amber-950 hover:bg-amber-200", dot: "bg-amber-500" },
  water: { label: "Water source", icon: "💧", cls: "bg-teal-200/85 border-teal-500/60 text-teal-950 hover:bg-teal-200", dot: "bg-teal-500" },
  gate: { label: "Gate", icon: "🚪", cls: "bg-stone-200/90 border-stone-400/60 text-stone-800 hover:bg-stone-200", dot: "bg-stone-400" },
  road: { label: "Road / track", icon: "🛤️", cls: "bg-orange-100/90 border-orange-300/60 text-orange-900 hover:bg-orange-100", dot: "bg-orange-300" },
  other: { label: "Other", icon: "📌", cls: "bg-muted border-border text-foreground hover:bg-muted", dot: "bg-muted-foreground" },
};

const kindMeta = (k: string) => KIND_META[k] ?? KIND_META.other;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------- Component ----------

export default function FarmMapView() {
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLDivElement>(null);
  const { data: items, isLoading } = useQuery({ queryKey: qk.map, queryFn: () => apiGet<MapItemDTO[]>("/api/map") });

  const [editing, setEditing] = useState<MapItemDTO | null>(null);
  const [creating, setCreating] = useState<null | { kind: MapItemDTO["kind"] }>(null);
  const [deleting, setDeleting] = useState<MapItemDTO | null>(null);
  const [arranging, setArranging] = useState(false);
  const [savingDrag, setSavingDrag] = useState(false);

  const { data: fields } = useQuery({ queryKey: qk.fields, queryFn: () => apiGet<FieldDTO[]>("/api/fields") });

  const stats = useMemo(() => {
    const list = items ?? [];
    return {
      total: list.length,
      fields: list.filter((i) => i.kind === "field").length,
      water: list.filter((i) => i.kind === "water").length,
      buildings: list.filter((i) => i.kind === "building").length,
    };
  }, [items]);

  const createItem = async (kind: MapItemDTO["kind"]) => {
    setCreating(null);
    try {
      const meta = kindMeta(kind);
      const created = await apiSend<MapItemDTO>("/api/map", "POST", {
        kind,
        label: `${meta.label} ${stats.total + 1}`,
        x: 32, y: 32, w: 22, h: 18,
      });
      await queryClient.invalidateQueries({ queryKey: qk.map });
      setEditing(created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add to the map");
    }
  };

  const saveDrag = async (item: MapItemDTO, offsetX: number, offsetY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nx = clamp(round1(item.x + (offsetX / canvas.offsetWidth) * 100), 0, 100 - item.w);
    const ny = clamp(round1(item.y + (offsetY / canvas.offsetHeight) * 100), 0, 100 - item.h);
    if (nx === item.x && ny === item.y) return;
    setSavingDrag(true);
    try {
      await apiSend(`/api/map/${item.id}`, "PUT", { x: nx, y: ny });
      await queryClient.invalidateQueries({ queryKey: qk.map });
    } catch {
      toast.error("Position could not be saved");
      await queryClient.invalidateQueries({ queryKey: qk.map });
    } finally {
      setSavingDrag(false);
    }
  };

  const autoArrangeFields = async () => {
    if (!fields || fields.length === 0) {
      toast.info("No fields recorded yet — add fields in Crops & Fields first, or place blocks manually.");
      return;
    }
    setArranging(true);
    try {
      const existing = items ?? [];
      const named = new Set(existing.map((i) => i.label.toLowerCase()));
      const cols = Math.min(3, fields.length);
      const cellW = 100 / cols;
      const rows = Math.ceil(fields.length / cols);
      const cellH = Math.min(26, 84 / rows);
      let idx = 0;
      for (const f of fields) {
        const label = `${f.name} 🌾`;
        if (named.has(label.toLowerCase())) { idx++; continue; }
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        await apiSend<MapItemDTO>("/api/map", "POST", {
          kind: "field",
          label: `${f.name} 🌾`,
          x: round1(3 + col * cellW + 1.5),
          y: round1(3 + row * cellH + 2),
          w: round1(cellW - 3),
          h: round1(cellH - 4),
        });
        idx++;
      }
      // Homestead + borehole if missing
      if (!named.has("homestead 🏠")) {
        await apiSend<MapItemDTO>("/api/map", "POST", { kind: "building", label: "Homestead 🏠", x: 40, y: 78, w: 16, h: 16 });
      }
      if (!named.has("borehole 💧")) {
        await apiSend<MapItemDTO>("/api/map", "POST", { kind: "water", label: "Borehole 💧", x: 78, y: 76, w: 10, h: 12 });
      }
      await queryClient.invalidateQueries({ queryKey: qk.map });
      toast.success(`Placed ${fields.length} field block${fields.length === 1 ? "" : "s"} — drag them anywhere.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-arrange failed");
    } finally {
      setArranging(false);
    }
  };

  const addStarterLayout = async () => {
    try {
      const starter: Omit<MapItemDTO, "id" | "color" | "notes">[] = [
        { kind: "field", label: "Big Field 🌾", x: 4, y: 8, w: 34, h: 38 },
        { kind: "field", label: "Soy Block 🌾", x: 40, y: 8, w: 28, h: 24 },
        { kind: "paddock", label: "River Paddock 🐄", x: 40, y: 36, w: 28, h: 26 },
        { kind: "paddock", label: "Hill Paddock 🐐", x: 70, y: 8, w: 26, h: 30 },
        { kind: "building", label: "Homestead 🏠", x: 6, y: 60, w: 16, h: 18 },
        { kind: "building", label: "Poultry House 🐔", x: 25, y: 62, w: 14, h: 14 },
        { kind: "water", label: "Borehole 💧", x: 72, y: 62, w: 11, h: 13 },
        { kind: "water", label: "Dam 💧", x: 86, y: 44, w: 12, h: 16 },
        { kind: "road", label: "Main Track 🛤️", x: 4, y: 86, w: 80, h: 8 },
        { kind: "gate", label: "Main Gate 🚪", x: 86, y: 86, w: 8, h: 8 },
      ];
      for (const s of starter) await apiSend("/api/map", "POST", s);
      await queryClient.invalidateQueries({ queryKey: qk.map });
      toast.success("Starter layout placed — drag blocks to match your real farm.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not place the starter layout");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <MapIcon className="size-5 text-primary" aria-hidden /> Farm Map
          </h2>
          <p className="text-sm text-muted-foreground">
            Your farm at a glance — fields, paddocks, water and buildings. Drag blocks to match reality. Works offline.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={(k) => createItem(k as MapItemDTO["kind"])}>
            <SelectTrigger className="h-11 w-44" aria-label="Add a map block">
              <span className="flex items-center gap-2"><Plus className="size-4" aria-hidden /> Add block…</span>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(KIND_META).map(([k, meta]) => (
                <SelectItem key={k} value={k}>
                  <span className="flex items-center gap-2">{meta.icon} {meta.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="min-h-11" onClick={autoArrangeFields} disabled={arranging}>
            <LayoutGrid className="size-4" aria-hidden /> Auto-place fields
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-hidden>
        {Object.entries(KIND_META).map(([k, meta]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${meta.dot}`} /> {meta.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><Scissors className="size-3" /> drag to move · click to edit</span>
      </div>

      {/* Canvas */}
      <Card className="overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          {isLoading ? (
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          ) : (items?.length ?? 0) === 0 ? (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-muted/30 p-6 text-center">
              <Mountain className="size-10 text-muted-foreground/60" aria-hidden />
              <div>
                <p className="font-semibold">Map out your farm layout</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Place blocks for your fields, paddocks, water sources and buildings, then drag them to match the real farm.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button className="min-h-11" onClick={addStarterLayout}>
                  <SquarePen className="size-4" aria-hidden /> Place a starter layout
                </Button>
                <Button variant="outline" className="min-h-11" onClick={autoArrangeFields} disabled={arranging}>
                  <Sprout className="size-4" aria-hidden /> Auto-place my fields
                </Button>
              </div>
            </div>
          ) : (
            <div
              ref={canvasRef}
              className="relative aspect-[4/3] w-full touch-none overflow-hidden rounded-xl border bg-[linear-gradient(rgba(0,0,0,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.045)_1px,transparent_1px)] bg-[size:5%_6.66%] dark:bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)]"
              role="application"
              aria-label="Farm layout canvas"
            >
              {/* North indicator */}
              <div className="pointer-events-none absolute right-2 top-2 flex size-8 items-center justify-center rounded-full border bg-card/90 text-[10px] font-bold shadow-sm" aria-hidden>
                N ↑
              </div>
              {savingDrag && <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">Saving…</div>}

              {(items ?? []).map((item) => {
                const meta = kindMeta(item.kind);
                return (
                  <motion.div
                    key={item.id}
                    drag
                    dragMomentum={false}
                    dragElastic={0.04}
                    onDragEnd={(_, info) => saveDrag(item, info.offset.x, info.offset.y)}
                    onTap={() => setEditing(item)}
                    style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` }}
                    className={`absolute flex cursor-grab select-none flex-col items-center justify-center rounded-lg border-2 p-1 shadow-sm transition-colors active:cursor-grabbing ${meta.cls}`}
                    whileDrag={{ zIndex: 30, scale: 1.03, boxShadow: "0 8px 20px rgba(0,0,0,0.18)" }}
                    role="button"
                    aria-label={`${meta.label}: ${item.label}. Drag or activate to edit.`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEditing(item);
                      }
                    }}
                  >
                    <span className="text-lg leading-none sm:text-xl" aria-hidden>{meta.icon}</span>
                    <span className="mt-0.5 line-clamp-2 text-center text-[10px] font-semibold leading-tight sm:text-xs">{item.label}</span>
                  </motion.div>
                );
              })}
            </div>
          )}

          {(items?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{stats.total} blocks · {stats.fields} fields · {stats.water} water · {stats.buildings} buildings</span>
              <span className="inline-flex items-center gap-1"><Fence className="size-3.5" aria-hidden /> Layout is saved automatically when you drag</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <MapItemEditDialog
        item={editing}
        onClose={() => setEditing(null)}
        onDeleted={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: qk.map }); }}
      />

      {/* Delete confirm (opened from edit dialog) */}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleting?.label}” from the map?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes the block from your farm layout — any linked field records stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await apiSend(`/api/map/${deleting.id}`, "DELETE");
                  await queryClient.invalidateQueries({ queryKey: qk.map });
                  setEditing(null);
                  toast.success("Removed from the map");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not remove the block");
                } finally {
                  setDeleting(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Edit dialog ----------

function MapItemEditDialog({ item, onClose, onDeleted }: {
  item: MapItemDTO | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<MapItemDTO | null>(item);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // hydrate draft whenever a different item opens (setTimeout keeps lint's set-state-in-effect happy)
  const [lastId, setLastId] = useState<string | null>(null);
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setTimeout(() => setDraft(item), 0);
  }
  if (!item || !draft) return null;

  const save = async () => {
    if (!draft.label.trim()) { setError("Give this block a name"); return; }
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/api/map/${draft.id}`, "PUT", {
        kind: draft.kind, label: draft.label.trim(),
        x: round1(draft.x), y: round1(draft.y), w: round1(draft.w), h: round1(draft.h),
        notes: draft.notes?.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: qk.map });
      toast.success("Block updated");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const nudge = (dx: number, dy: number) =>
    setDraft((d) => (d ? { ...d, x: clamp(round1(d.x + dx), 0, 100 - d.w), y: clamp(round1(d.y + dy), 0, 100 - d.h) } : d));

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
        <DialogContent className="farm-scroll max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span aria-hidden>{kindMeta(draft.kind).icon}</span> Edit map block
            </DialogTitle>
            <DialogDescription>
              Position is saved as a % of your layout — it stays correct on phones, tablets and prints.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="map-label">Name</Label>
                <Input id="map-label" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="map-kind">Type</Label>
                <Select value={draft.kind} onValueChange={(k) => setDraft({ ...draft, kind: k })}>
                  <SelectTrigger id="map-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_META).map(([k, meta]) => (
                      <SelectItem key={k} value={k}>{meta.icon} {meta.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="map-w">Width %</Label>
                <Input id="map-w" type="number" min={2} max={100} step={0.5} value={draft.w} onChange={(e) => setDraft({ ...draft, w: clamp(Number(e.target.value) || 2, 2, 100) })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="map-h">Height %</Label>
                <Input id="map-h" type="number" min={2} max={100} step={0.5} value={draft.h} onChange={(e) => setDraft({ ...draft, h: clamp(Number(e.target.value) || 2, 2, 100) })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nudge position</Label>
              <div className="mx-auto grid w-36 grid-cols-3 gap-1">
                <span />
                <Button variant="outline" size="sm" className="h-9" onClick={() => nudge(0, -1)} aria-label="Move up">↑</Button>
                <span />
                <Button variant="outline" size="sm" className="h-9" onClick={() => nudge(-1, 0)} aria-label="Move left">←</Button>
                <Button variant="outline" size="sm" className="h-9" onClick={() => nudge(0, 1)} aria-label="Move down">↓</Button>
                <Button variant="outline" size="sm" className="h-9" onClick={() => nudge(1, 0)} aria-label="Move right">→</Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="map-notes">Notes</Label>
              <Textarea id="map-notes" rows={2} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="e.g. borehole serves paddocks A and B" />
            </div>

            {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
          </div>

          <DialogFooter className="mt-2 flex-row items-center justify-between gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden /> Remove
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save block"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{draft.label}” from the map?</AlertDialogTitle>
            <AlertDialogDescription>This only affects the layout drawing — records stay untouched.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await apiSend(`/api/map/${draft.id}`, "DELETE");
                  await queryClient.invalidateQueries({ queryKey: qk.map });
                  setConfirmDelete(false);
                  onDeleted();
                  toast.success("Removed from the map");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not remove");
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
