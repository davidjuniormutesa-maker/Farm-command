"use client";

import { Download, FileArchive, Keyboard, ShieldCheck, Smartphone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/components/farm/pwa";
import { toast } from "sonner";

/** About Farm Command — identity, privacy stance and install hints. */
export function AboutCard() {
  const { canInstall, promptInstall } = useInstallPrompt();

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") toast.success("Farm Command was installed 🎉");
    else if (outcome === "dismissed") toast.info("You can install any time from this button.");
  };
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>About Farm Command</CardTitle>
        <CardDescription>
          Made for a Zambian family farm 🇿🇲 — built to work where the network does not.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-xl text-primary-foreground" aria-hidden>
            🌿
          </div>
          <div>
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              Farm Command
              <Badge variant="outline" className="text-xs">
                v1.0
              </Badge>
            </p>
            <p className="text-sm text-muted-foreground">Your farm. Your data. Your decisions.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
            <Keyboard className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Find anything fast.</span> Press{" "}
              <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">Ctrl</kbd> +{" "}
              <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">K</kbd> (or{" "}
              <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">⌘</kbd> +{" "}
              <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">K</kbd>) anywhere to
              search animals, crops, tasks and more.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
            <Download className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Install the app.</span> Use the download
              icon in the header or the &ldquo;Install&rdquo; option in your browser menu — Farm
              Command then opens like a native app and keeps working offline.
            </p>
          </div>
        </div>

        {canInstall && (
          <div className="flex flex-col gap-3 rounded-lg border border-gold/60 bg-gold/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Use Farm Command like an app.</span> Install it on this
                device for faster access, an icon on your home screen and reminders.
              </p>
            </div>
            <Button onClick={handleInstall} className="min-h-11 shrink-0">
              <Download className="size-4" aria-hidden />
              Install app
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileArchive className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Take Farm Command with you.</span>{" "}
              Download the complete source code as a zip — runs anywhere with{" "}
              <code className="rounded border bg-muted px-1 font-mono text-xs">bun install</code> +{" "}
              <code className="rounded border bg-muted px-1 font-mono text-xs">bun run dev</code>.
            </p>
          </div>
          <Button asChild className="min-h-11 shrink-0">
            <a
              href="/farm-command.zip"
              download
              aria-label="Download Farm Command source code as a zip file"
            >
              <Download className="size-4" aria-hidden />
              Source code (.zip)
            </a>
          </Button>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your records never leave this device except when you explicitly download a backup or turn
          on an online service like weather or the AI assistant.
        </p>
      </CardContent>
    </Card>
  );
}
