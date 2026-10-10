"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Database,
  Download,
  FileUp,
  Loader2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { CSV_TABLES, BackupCounts, describeCounts, downloadFile, todayFileStamp } from "./settings-shared";
import { CsvImportDialog } from "./csv-import-dialog";

/** Minimal shape check before offering a restore — the server re-validates fully. */
function looksLikeBackup(parsed: unknown): parsed is { version: number; data: unknown } {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { version?: unknown }).version === 1 &&
    typeof (parsed as { data?: unknown }).data === "object"
  );
}

interface PendingImport {
  name: string;
  payload: unknown;
}

/**
 * Data ownership card — export / import / CSV export / demo seed / full reset.
 * Every destructive action sits behind a confirmation dialog; the reset
 * additionally requires typing RESET. All state lives in this one component.
 */
export function DataCard() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileChosen, setFileChosen] = useState<File | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [csvTable, setCsvTable] = useState<string>("animals");
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const [busy, setBusy] = useState<"backup" | "csv" | null>(null);

  // ---------- Export ----------
  const downloadBackup = async () => {
    setBusy("backup");
    try {
      const data = await apiGet<Record<string, unknown>>("/api/backup");
      downloadFile(
        `farm-command-backup-${todayFileStamp()}.json`,
        JSON.stringify(data, null, 2),
        "application/json"
      );
      toast.success("Backup downloaded — keep it somewhere safe.");
    } catch (err) {
      toast.error((err as Error).message || "The backup could not be created.");
    } finally {
      setBusy(null);
    }
  };

  const downloadCsv = async () => {
    setBusy("csv");
    try {
      const res = await fetch(`/api/backup/csv?table=${encodeURIComponent(csvTable)}`, { cache: "no-store" });
      if (!res.ok) {
        let message = `Export failed (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) message = String(data.error);
        } catch {
          /* response was not JSON */
        }
        throw new ApiError(message, res.status);
      }
      const csv = await res.text();
      downloadFile(`farm-command-${csvTable}-${todayFileStamp()}.csv`, csv, "text/csv");
      toast.success(`${csvTable} exported as CSV.`);
    } catch (err) {
      toast.error((err as Error).message || "The CSV could not be exported.");
    } finally {
      setBusy(null);
    }
  };

  // ---------- Import ----------
  const onFileChosen = (file: File | undefined) => {
    if (!file) return;
    setFileChosen(file);
  };

  const prepareImport = async () => {
    const file = fileChosen;
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error("That file could not be read — a Farm Command backup must be a .json file.");
      return;
    }
    if (!looksLikeBackup(parsed)) {
      toast.error("This file doesn't look like a Farm Command backup.");
      return;
    }
    setPendingImport({ name: file.name, payload: parsed });
  };

  const runImport = useMutation({
    mutationFn: (payload: unknown) =>
      apiSend<{ ok: true; counts: BackupCounts }>("/api/backup", "POST", payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      toast.success(`Backup restored — ${describeCounts(res.counts)}.`);
      setPendingImport(null);
      setFileChosen(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: Error) => {
      toast.error(err.message || "The backup could not be restored.");
      setPendingImport(null);
    },
  });

  // ---------- Demo seed / Reset ----------
  const runSeed = useMutation({
    mutationFn: () => apiSend<{ ok: true }>("/api/seed", "POST", { action: "seed" }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Demo data loaded — explore, then reset it any time from here.");
    },
    onError: (err: Error) => toast.error(err.message || "Loading demo data failed."),
  });

  const runReset = useMutation({
    mutationFn: () => apiSend<{ ok: true }>("/api/seed", "POST", { action: "reset", withSettings: false }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("All farm data has been reset. The farm is yours to rebuild.");
    },
    onError: (err: Error) => toast.error(err.message || "The reset failed."),
  });

  const resetReady = resetText.trim().toUpperCase() === "RESET";

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-4 text-primary" aria-hidden />
          Your data
        </CardTitle>
        <CardDescription>
          Everything lives on this device. Download a backup regularly — a backup is the only way to
          move your records to a new phone or computer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Backup / restore */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-medium">Full backup (JSON)</p>
            <p className="text-xs text-muted-foreground">
              Downloads every record — livestock, crops, tasks, finances, knowledge, settings — as one file.
            </p>
            <div className="mt-auto pt-1">
              <Button variant="outline" className="min-h-11 w-full sm:w-auto" disabled={busy !== null} onClick={downloadBackup}>
                {busy === "backup" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
                Download full backup
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-medium">Import backup</p>
            <p className="text-xs text-muted-foreground">
              Restores a Farm Command backup file. This replaces ALL current data on this device.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label="Choose a backup file"
              onChange={(e) => onFileChosen(e.target.files?.[0])}
            />
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" className="min-h-11 max-w-full" onClick={() => fileInputRef.current?.click()}>
                <FileUp className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{fileChosen ? fileChosen.name : "Choose backup file…"}</span>
              </Button>
              <Button className="min-h-11" disabled={!fileChosen || runImport.isPending} onClick={prepareImport}>
                {runImport.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Import
              </Button>
            </div>
          </div>
        </div>

        {/* CSV export */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
          <p className="text-sm font-medium">Export a table as CSV</p>
          <p className="text-xs text-muted-foreground">
            Spreadsheets, accountants and agribusiness buyers all read CSV.
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Select value={csvTable} onValueChange={setCsvTable}>
              <SelectTrigger className="min-h-11 w-full sm:w-56" aria-label="Table to export as CSV">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CSV_TABLES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="min-h-11" disabled={busy !== null} onClick={downloadCsv}>
              {busy === "csv" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
              Download CSV
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => setCsvImportOpen(true)}>
              <FileUp className="size-4 shrink-0" aria-hidden />
              Import from CSV
            </Button>
          </div>
        </div>

        {/* Demo & reset */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-medium">Demo farm</p>
            <p className="text-xs text-muted-foreground">
              Loads a small demo farm so you can explore every module with realistic records.
            </p>
            <div className="mt-auto pt-1">
              <Button variant="outline" className="min-h-11" disabled={runSeed.isPending} onClick={() => setConfirmSeed(true)}>
                {runSeed.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                Load demo data
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <TriangleAlert className="size-4" aria-hidden />
              Danger zone
            </p>
            <p className="text-xs text-muted-foreground">
              Removes every animal, crop, task, transaction and note on this device. Your farm
              profile and settings are kept. Download a backup first — this cannot be undone.
            </p>
            <div className="mt-auto pt-1">
              <Button variant="destructive" className="min-h-11" disabled={runReset.isPending} onClick={() => setConfirmReset(true)}>
                {runReset.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Reset all farm data
              </Button>
            </div>
          </div>
        </div>
      </CardContent>

      {/* CSV import (animals / transactions) — offline-first facade writes */}
      <CsvImportDialog open={csvImportOpen} onOpenChange={setCsvImportOpen} />

      {/* Import confirmation */}
      <AlertDialog open={pendingImport !== null} onOpenChange={(next) => !next && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace ALL current data?</AlertDialogTitle>
            <AlertDialogDescription>
              Importing <span className="font-medium">{pendingImport?.name}</span> will erase every
              record currently on this device and replace it with the contents of the backup.
              Download a backup of the current data first if you are not sure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive"
              disabled={runImport.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingImport) runImport.mutate(pendingImport.payload);
              }}
            >
              {runImport.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Replace data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Demo seed confirmation */}
      <AlertDialog open={confirmSeed} onOpenChange={setConfirmSeed}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load demo data?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the current records on this device with the demo farm. Your settings are
              kept. You can reset to an empty farm afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmSeed(false);
                runSeed.mutate();
              }}
            >
              Load demo data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset confirmation — requires typing RESET */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all farm data?</AlertDialogTitle>
            <AlertDialogDescription>
              Every animal, crop, task, transaction and knowledge note on this device will be
              permanently deleted. Settings are kept. This cannot be undone.
              <br />
              <br />
              Type <span className="font-mono font-semibold">RESET</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            placeholder="Type RESET"
            aria-label="Type RESET to confirm the reset"
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive"
              disabled={!resetReady || runReset.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (resetReady) {
                  setConfirmReset(false);
                  setResetText("");
                  runReset.mutate();
                }
              }}
            >
              {runReset.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
