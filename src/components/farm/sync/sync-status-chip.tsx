"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, RefreshCcw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { deriveSyncLabel, syncNow, useSyncStore } from "@/lib/offline/sync";

/**
 * Connection + sync indicator for the app header.
 *
 * Compact pill (dot/icon + label on >=sm screens) that opens a popover with
 * the last synced time, pending change count, a farmer-friendly explanation
 * of any sync error, and a manual "Sync now" action.
 */

type LabelBehavior = "hide-on-small" | "always";

function friendlySyncError(error: string): string {
  const e = error.toLowerCase();
  if (e.includes("offline")) {
    return "You're offline. Everything you do is saved on this device and will sync when the connection returns.";
  }
  if (e.includes("fetch") || e.includes("network")) {
    return "We couldn't reach the farm server. Your changes are safe on this device and will sync when the connection returns.";
  }
  if (e.includes("push") || e.includes("pull") || e.includes("500") || e.includes("server")) {
    return "The farm server had trouble with the last sync. Your changes are safe on this device — we'll keep trying automatically.";
  }
  return "Something went wrong during the last sync. Your changes are safe on this device and will sync when the connection returns.";
}

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Never";
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  return sameDay ? time : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`;
}

export default function SyncStatusChip({ labelBehavior = "hide-on-small" }: { labelBehavior?: LabelBehavior }) {
  const online = useSyncStore((s) => s.online);
  const syncing = useSyncStore((s) => s.syncing);
  const pending = useSyncStore((s) => s.pending);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const lastError = useSyncStore((s) => s.lastError);

  const [busy, setBusy] = useState(false);
  const { label, detail } = deriveSyncLabel({ online, syncing, pending, lastError });

  const tone =
    label === "issue"
      ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
      : label === "pending" || label === "offline"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  const dotColor =
    label === "issue" ? "bg-red-500" : label === "pending" || label === "offline" ? "bg-amber-500" : "bg-emerald-500";

  const showLabel = labelBehavior === "always" ? "inline" : "hidden sm:inline";

  const handleSyncNow = async () => {
    setBusy(true);
    try {
      const result = await syncNow("manual");
      if ("error" in result) {
        if (result.error === "offline") {
          toast.info("You're offline — your changes are saved and will sync when the connection returns.");
        } else if (result.error !== "already-syncing") {
          toast.error("Sync didn't finish this time. Your changes are safe on this device.");
        }
      } else {
        toast.success(`Up to date — ${result.pushed} sent, ${result.pulled} received.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={`h-9 gap-2 rounded-full border px-3 text-xs font-medium ${tone}`}
          aria-label={`Connection and sync: ${detail}`}
          title={detail}
        >
          {syncing ? (
            <RefreshCcw className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <span className="relative flex size-2" aria-hidden>
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${dotColor}`} />
              <span className={`relative inline-flex size-2 rounded-full ${dotColor}`} />
            </span>
          )}
          <span className={`${showLabel} max-w-52 truncate`}>{detail}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-xl p-4">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Connection &amp; sync</p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {label === "offline" ? (
              <WifiOff className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            ) : label === "issue" ? (
              <RefreshCcw className="size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            )}
            {detail}
          </p>
        </div>

        <Separator className="my-3" />

        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Last synced</dt>
            <dd className="inline-flex items-center gap-1.5 font-medium">
              <Clock className="size-3.5 text-muted-foreground" aria-hidden />
              {formatSyncedAt(lastSyncedAt)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Waiting to sync</dt>
            <dd className="font-medium tabular-nums">
              {pending > 0 ? `${pending} change${pending === 1 ? "" : "s"}` : "Nothing"}
            </dd>
          </div>
        </dl>

        {lastError && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs leading-relaxed text-foreground">
            {friendlySyncError(lastError)}
            <span className="mt-1 block font-mono text-[10px] text-muted-foreground" title={lastError}>
              Technical detail: {lastError}
            </span>
          </p>
        )}

        {label === "offline" && !lastError && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs leading-relaxed text-foreground">
            Offline mode — keep recording animals, tasks and sales as usual. Everything syncs to the farm server
            automatically once you're back online.
          </p>
        )}

        <Button className="mt-3 w-full min-h-11 gap-2" onClick={handleSyncNow} disabled={syncing || busy || !online}>
          <RefreshCcw className={`size-4 ${syncing || busy ? "animate-spin" : ""}`} aria-hidden />
          {syncing || busy ? "Syncing…" : "Sync now"}
        </Button>
        {!online && (
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            Sync is paused while offline — it resumes automatically.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
