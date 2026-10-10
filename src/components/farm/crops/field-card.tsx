"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Droplets, MapPin, Mountain, Pencil, Sprout, Trash2 } from "lucide-react";
import { apiSend } from "@/lib/api";
import { statusBadgeClass, titleCase } from "@/lib/farm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDeleteDialog, formatHa } from "./shared";
import type { FieldWithCycles } from "./types";

/** Field card: summary details, current crop chip and edit/delete actions. */
export function FieldCard({
  field,
  onOpen,
  onEdit,
}: {
  field: FieldWithCycles;
  onOpen: (field: FieldWithCycles) => void;
  onEdit: (field: FieldWithCycles) => void;
}) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => apiSend(`/api/fields/${field.id}`, "DELETE"),
    onSuccess: () => {
      toast.success(`Field "${field.name}" deleted.`, {
        description: "Any crop cycles on it were kept without a field.",
      });
      setConfirmOpen(false);
      for (const key of [["fields"], ["crops"], ["activities"], ["summary"], ["dashboard"]] as const) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err) => {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not delete the field.");
    },
  });

  const activeCycles = field.cropCycles ?? [];
  const currentCycle = activeCycles.find((c) => c.status === "growing") ?? activeCycles[0];

  return (
    <Card
      className="cursor-pointer gap-3 rounded-xl p-4 transition-shadow hover:shadow-md"
      onClick={() => onOpen(field)}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          className="text-left text-base font-semibold leading-tight hover:underline focus-visible:outline-2"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(field);
          }}
        >
          {field.name}
        </button>
        {field.areaHa != null && <Badge variant="secondary">{formatHa(field.areaHa)}</Badge>}
      </div>

      <div className="space-y-1.5 text-sm text-muted-foreground">
        {field.location && (
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{field.location}</span>
          </p>
        )}
        {field.irrigation && (
          <p className="flex items-center gap-1.5">
            <Droplets className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{field.irrigation}</span>
          </p>
        )}
        {field.soilNotes && (
          <p className="flex items-start gap-1.5">
            <Mountain className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="line-clamp-2">{field.soilNotes}</span>
          </p>
        )}
      </div>

      {currentCycle && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
            <Sprout className="size-3.5 text-primary" aria-hidden />
            {currentCycle.crop}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(currentCycle.status)}`}
          >
            {titleCase(currentCycle.status)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-1 border-t pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-10 gap-1.5 px-3"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(field);
          }}
          aria-label={`Edit field ${field.name}`}
        >
          <Pencil className="size-4" aria-hidden />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 gap-1.5 px-3 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          aria-label={`Delete field ${field.name}`}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </Button>
      </div>

      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${field.name}"?`}
        description="The field will be removed. Crop cycles and activity records that were linked to it are kept, just no longer attached to a field."
        onConfirm={() => deleteMutation.mutate()}
      />
    </Card>
  );
}
