"use client";

import { useState } from "react";
import { CalendarDays, Droplets, MapPin, Mountain, NotebookPen, Pencil, Ruler, Sprout } from "lucide-react";
import { formatDate, formatDateShort, statusBadgeClass, titleCase } from "@/lib/farm";
import type { FieldDTO } from "@/lib/farm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ActivityTimeline } from "./activity-timeline";
import { LogActivityDialog } from "./log-activity-dialog";
import { formatHa } from "./shared";
import type { CropCycleWithField, FieldWithCycles } from "./types";

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  );
}

/** Full field info + its crop cycles + the activity log for this field. */
export function FieldDetailDialog({
  field,
  crops,
  onOpenChange,
  onEdit,
}: {
  field: FieldWithCycles;
  crops: CropCycleWithField[];
  onOpenChange: (open: boolean) => void;
  onEdit: (field: FieldDTO) => void;
}) {
  const [logOpen, setLogOpen] = useState(false);

  const fieldCycles = crops.filter((c) => c.fieldId === field.id);

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{field.name}</DialogTitle>
            <DialogDescription>
              Field details, crop history and the work log for this plot.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* --- Details --- */}
            <div className="space-y-2.5">
              <DetailRow icon={Ruler} label="Area" value={field.areaHa != null ? formatHa(field.areaHa) : "Not set"} />
              <DetailRow icon={MapPin} label="Location" value={field.location ?? "—"} />
              <DetailRow icon={Droplets} label="Irrigation" value={field.irrigation ?? "—"} />
              <DetailRow icon={Mountain} label="Soil" value={field.soilNotes ?? "—"} />
              {field.notes && <DetailRow icon={NotebookPen} label="Notes" value={field.notes} />}
              <DetailRow icon={CalendarDays} label="Recorded" value={formatDate(field.createdAt)} />
            </div>

            <Separator />

            {/* --- Crop cycles on this field --- */}
            <section aria-label="Crop cycles on this field" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Crop cycles ({fieldCycles.length})</h3>
                <Badge variant="secondary">{formatHa(field.areaHa)}</Badge>
              </div>
              {fieldCycles.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">
                  No crop cycles recorded on this field yet.
                </p>
              ) : (
                <ul className="farm-scroll max-h-40 space-y-2 overflow-y-auto pr-1">
                  {fieldCycles.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/60 px-3 py-2 text-sm">
                      <Sprout className="size-4 shrink-0 text-primary" aria-hidden />
                      <span className="font-medium">{c.crop}</span>
                      {c.variety && <span className="truncate text-xs text-muted-foreground">{c.variety}</span>}
                      <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(c.status)}`}>
                        {titleCase(c.status)}
                      </span>
                      <span className="w-full text-xs text-muted-foreground sm:w-auto">
                        {formatDateShort(c.plantingDate)} → {formatDateShort(c.expectedHarvestDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Separator />

            {/* --- Activity log --- */}
            <section aria-label="Field activity log" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Activity log</h3>
                <Button variant="outline" size="sm" className="min-h-11 gap-1.5" onClick={() => setLogOpen(true)}>
                  <NotebookPen className="size-4" aria-hidden />
                  Log activity
                </Button>
              </div>
              <ActivityTimeline filter={{ fieldId: field.id }} />
            </section>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" className="min-h-11 gap-1.5" onClick={() => onEdit(field)}>
              <Pencil className="size-4" aria-hidden />
              Edit field
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <LogActivityDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        key={String(logOpen)}
        context={{ fieldId: field.id }}
        contextLabel={field.name}
      />
    </>
  );
}
