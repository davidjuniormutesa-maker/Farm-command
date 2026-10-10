"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiSend, qk } from "@/lib/api";
import type { FarmSettingsData } from "@/lib/farm";
import { useFarmStore } from "@/components/farm/store";

const STEPS = 4;

/** First-run setup: welcome → farm identity → what you keep/grow → notification choice → done. */
export default function OnboardingDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [farmName, setFarmName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [location, setLocation] = useState("Lusaka, Zambia");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const setView = useFarmStore((s) => s.setView);

  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: () => apiGet<FarmSettingsData>("/api/settings") });

  useEffect(() => {
    if (settings && !settings.onboarded) {
      setOpen(true);
      setFarmName(settings.farmName === "My Farm" ? "" : settings.farmName);
      setOwnerName(settings.ownerName === "Farmer" ? "" : settings.ownerName);
      setLocation(settings.location || "Lusaka, Zambia");
    }
  }, [settings]);

  const finish = async (withDemo: boolean, notify: boolean) => {
    setSaving(true);
    try {
      await apiSend("/api/settings", "PATCH", {
        farmName: farmName.trim() || "My Farm",
        ownerName: ownerName.trim() || "Farmer",
        location: location.trim() || "Lusaka, Zambia",
        onboarded: true,
        notificationsEnabled: notify,
      });
      if (withDemo) {
        await apiSend("/api/seed", "POST", { action: "seed" });
      }
      await queryClient.invalidateQueries();
      setOpen(false);
      setView("dashboard");
      toast.success(
        withDemo
          ? "Welcome to Farm Command! Demo data loaded — explore and reset it any time in Settings."
          : "Your farm is set up. Welcome to Farm Command! 🌾"
      );
    } catch {
      toast.error("Setup could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {step === 0 ? (
            <div className="mb-1 overflow-hidden rounded-2xl">
              <img
                src="/assets/farm-hero.png"
                alt="Illustration of a Zambian family farm at sunrise — maize fields, cattle and a farmhouse"
                className="h-36 w-full object-cover sm:h-44"
              />
            </div>
          ) : (
            <div className="mx-auto mb-1 flex size-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-gradient-to-br from-primary/15 to-amber-500/15 text-3xl shadow-sm" aria-hidden>🌿</div>
          )}
          <DialogTitle className="text-center text-xl">
            {step === 0 && "Welcome to Farm Command"}
            {step === 1 && "About your farm"}
            {step === 2 && "What do you keep & grow?"}
            {step === 3 && "You're ready"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {step === 0 && (
              <>Your farm. Your data. Your decisions. 🇿🇲<br />
              <span className="text-xs">An offline-first farm tool made for Zambian farms — and made especially for you.</span></>
            )}
            {step === 1 && "Tell us about the farm so records, reminders and weather make sense."}
            {step === 2 && "This shapes your dashboard and quick actions later. Nothing is locked in — add everything at your own pace."}
            {step === 3 && "Optionally load a small demo farm to explore first — then make it your own."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5" aria-hidden>
          {Array.from({ length: STEPS }).map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"}`} />
          ))}
        </div>

        <div className="space-y-4">
          {step === 0 && (
            <div className="space-y-2.5">
              <div className="rounded-xl border bg-muted/40 p-3 text-center text-sm leading-relaxed text-muted-foreground">
                🔒 Everything you record stays <span className="font-medium text-foreground">on this device</span> — no account,
                no cloud. Export a backup any time, and it keeps working when the network doesn&rsquo;t.
              </div>
              <p className="text-center text-xs italic text-muted-foreground">Happy Birthday, Dad ❤️ — a small farm tool built especially for you.</p>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ob-farm">Farm name</Label>
                <Input id="ob-farm" value={farmName} onChange={(e) => setFarmName(e.target.value)} placeholder="e.g. Chilenje Farm" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-owner">Your name</Label>
                <Input id="ob-owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Dad" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-loc">Location</Label>
                <Input id="ob-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Chisamba, Zambia" />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {["🐄 Cattle", "🐐 Goats", "🐑 Sheep", "🐖 Pigs", "🐔 Poultry", "🌽 Maize", "🫘 Soybeans", "🥬 Vegetables"].map((x) => (
                <div key={x} className="rounded-lg border bg-muted/30 px-3 py-2.5 text-center font-medium shadow-sm transition-colors hover:border-primary/40 hover:bg-accent">{x}</div>
              ))}
              <p className="col-span-2 text-center text-xs text-muted-foreground">All of these (and more) are ready to record — nothing is locked in here.</p>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Choose how to start:</p>
              <Button disabled={saving} onClick={() => finish(true, false)} className="h-12 w-full justify-between bg-gradient-to-r from-primary to-primary/80 text-left shadow-sm">
                <span>Load demo farm data</span>
                <span className="text-xs opacity-90">Recommended for a first look</span>
              </Button>
              <Button disabled={saving} variant="outline" onClick={() => finish(false, false)} className="h-12 w-full justify-between text-left">
                <span>Start with an empty farm</span>
                <span className="text-xs opacity-60">Clean slate</span>
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" disabled={saving || step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Button>
          {step < STEPS - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>{step === 0 ? "Get started" : "Next"}</Button>
          ) : (
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => finish(false, false)}>Skip setup</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
