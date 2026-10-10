"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/components/farm/pwa";
import { getMeta, setMeta } from "@/lib/offline/db";

/**
 * Friendly "Install Farm Command" card, shown only while the browser offers
 * the PWA install prompt and the farmer has not dismissed it before.
 * Dismissal is remembered per browser in the offline `meta` table, so the
 * banner never nags again on this device.
 */
export default function InstallBanner() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [checked, setChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMeta("installDismissedAt")
      .then((value) => {
        if (!cancelled) setDismissed(Boolean(value));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked || dismissed || !canInstall) return null;

  const dismiss = async () => {
    setDismissed(true);
    try {
      await setMeta("installDismissedAt", new Date().toISOString());
    } catch {
      /* non-fatal — banner just may reappear next visit */
    }
  };

  const install = async () => {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") toast.success("Farm Command was installed 🎉");
      else if (outcome === "dismissed") toast.info("No problem — you can install any time from the header icon.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Install Farm Command"
      className="flex items-start gap-3 rounded-xl border border-gold/60 bg-gold/10 p-3.5 sm:items-center"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gold/20 text-gold-foreground"
        aria-hidden
      >
        <Smartphone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install Farm Command</p>
        <p className="text-xs leading-snug text-muted-foreground">
          Use Farm Command like an app for faster access and reminders.
        </p>
      </div>
      <Button size="sm" className="min-h-9 shrink-0 gap-1.5" onClick={install} disabled={busy}>
        Install
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        aria-label="Dismiss install suggestion"
        title="Dismiss"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
