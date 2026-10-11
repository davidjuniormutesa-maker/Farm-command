"use client";

/**
 * ExportDialog — one-tap backup/export of farm records to Excel, Word or PDF.
 * Everything runs offline from the local database (see src/lib/offline/export.ts).
 * Renders its own trigger button so it can be dropped into the header.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  collectSheets,
  downloadExcel,
  downloadWord,
  exportPdf,
  SCOPE_LABELS,
  type ExportScope,
} from "@/lib/offline/export";

type Format = "excel" | "word" | "pdf";

const SCOPE_ORDER: ExportScope[] = [
  "all",
  "livestock",
  "poultry",
  "crops",
  "tasks",
  "finances",
  "health",
];

const FORMATS: { id: Format; label: string; hint: string; icon: React.ElementType }[] = [
  { id: "excel", label: "Excel", hint: "Spreadsheet (.xls)", icon: FileSpreadsheet },
  { id: "word", label: "Word", hint: "Document (.doc)", icon: FileText },
  { id: "pdf", label: "PDF", hint: "Print / save as PDF", icon: Printer },
];

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function ExportDialog() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>("all");
  const [format, setFormat] = useState<Format>("excel");
  const [busy, setBusy] = useState(false);

  const runExport = async () => {
    setBusy(true);
    try {
      const sheets = await collectSheets(scope);
      const total = sheets.reduce((n, s) => n + s.rows.length, 0);
      if (total === 0) {
        toast.info("There are no records to export for that choice yet.");
        return;
      }
      const title = `Farm Command — ${SCOPE_LABELS[scope]}`;
      const subtitle = `Exported ${new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`;
      const base = `farm-command-${scope}-${stamp()}`;

      if (format === "excel") {
        downloadExcel(sheets, base);
        toast.success("Excel file downloaded.");
      } else if (format === "word") {
        downloadWord(sheets, base, title, subtitle);
        toast.success("Word file downloaded.");
      } else {
        const ok = exportPdf(sheets, title, subtitle);
        if (ok) {
          toast.success("Print view opened — choose ‘Save as PDF’.");
        } else {
          toast.error("Your browser blocked the print window. Allow pop-ups and try again.");
          return;
        }
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export your data.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="size-9" aria-label="Export farm data">
          <Download className="size-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export your data</DialogTitle>
          <DialogDescription>
            Save a copy of your records. This works offline — the file is made right here on your device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="export-scope">What to export</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ExportScope)}>
              <SelectTrigger id="export-scope" className="w-full" aria-label="What to export">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Format</Label>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const active = format === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all focus-visible:outline-2 focus-visible:outline-ring ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-card text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="size-5" aria-hidden />
                    <span className="text-xs font-semibold">{f.label}</span>
                    <span className="text-[10px] leading-tight">{f.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button type="button" className="min-h-11 w-full" onClick={runExport} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            {busy ? "Preparing…" : "Export"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Excel for numbers · Word for a document · PDF for printing or sharing
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
