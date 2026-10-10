"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Loader2, RadioTower, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiSend, qk } from "@/lib/api";
import type { FarmSettingsData } from "@/lib/farm";
import { sendTestNotification } from "@/lib/offline/reminders";
import {
  getPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStatus,
} from "@/lib/offline/push-client";
import { useNotifications } from "@/components/farm/pwa";
import { usePatchSettings } from "./settings-shared";

interface NotifyDraft {
  notificationsEnabled: boolean;
  reminderLeadDays: string;
  quietHoursStart: string;
  quietHoursEnd: string;
}

const LEAD_OPTIONS = ["0", "1", "2", "3", "4", "5", "6", "7"] as const;

function toDraft(s: FarmSettingsData): NotifyDraft {
  return {
    notificationsEnabled: Boolean(s.notificationsEnabled),
    reminderLeadDays: String(Math.min(7, Math.max(0, Math.round(s.reminderLeadDays ?? 3)))),
    quietHoursStart: s.quietHoursStart || "20:00",
    quietHoursEnd: s.quietHoursEnd || "06:00",
  };
}

type PushBusy = "subscribe" | "test" | "unsubscribe" | "check" | null;

/**
 * Notification preferences. Honest by design:
 * - In-app reminders always work (they are computed from the local database).
 * - Browser notifications are a progressive enhancement gated by permission.
 * - Web Push (server-delivered) is shown separately with its real status —
 *   it only works while the device is online and never fakes success.
 */
export function NotificationsCard() {
  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: () => apiGet<FarmSettingsData>("/api/settings") });
  const patch = usePatchSettings();
  const { permission, requestPermission } = useNotifications();
  const [draft, setDraft] = useState<NotifyDraft>({ notificationsEnabled: false, reminderLeadDays: "3", quietHoursStart: "20:00", quietHoursEnd: "06:00" });
  const [dirty, setDirty] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // ---- Web Push status (real, re-read after every action) ----
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushBusy, setPushBusy] = useState<PushBusy>(null);

  const refreshPush = useCallback(async () => {
    try {
      setPushStatus(await getPushStatus());
    } catch {
      /* keep last known status; the UI shows what it knows */
    }
  }, []);

  useEffect(() => {
    void refreshPush();
  }, [refreshPush]);

  useEffect(() => {
    if (!settings || dirty) return;
    const t = setTimeout(() => setDraft(toDraft(settings)));
    return () => clearTimeout(t);
  }, [settings, dirty]);

  const update = (p: Partial<NotifyDraft>) => {
    setDirty(true);
    setFieldError(null);
    setDraft((d) => ({ ...d, ...p }));
  };

  const save = () => {
    if (!settings) return;
    const parsed = Number(draft.reminderLeadDays);
    if (!isFinite(parsed) || parsed < 0 || parsed > 7) {
      setFieldError("Reminder lead time must be between 0 and 7 days.");
      return;
    }
    patch.mutate(
      {
        notificationsEnabled: draft.notificationsEnabled,
        reminderLeadDays: Math.round(parsed),
        quietHoursStart: draft.quietHoursStart,
        quietHoursEnd: draft.quietHoursEnd,
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Notification settings saved.");
        },
        onError: (err: Error) => toast.error(err.message || "The settings could not be saved."),
      }
    );
  };

  // ---- Test notification (real result, never faked) ----
  const testNotification = async () => {
    if (permission === "unsupported") {
      toast.info("This browser does not support notifications. In-app reminders always work.");
      return;
    }
    if (permission === "denied") {
      toast.warning(
        "Notifications are blocked for this site. Open your browser's site settings (padlock icon in the address bar) to allow them. In-app reminders still work."
      );
      return;
    }
    if (permission !== "granted") {
      const result = await requestPermission();
      if (result !== "granted") {
        toast.info("No problem — reminders will still appear inside the app.");
        return;
      }
    }
    setTesting(true);
    try {
      const result = await sendTestNotification();
      if (result.ok) toast.success("Test notification sent — check your notifications.");
      else toast.error(result.reason ?? "Could not show the test notification on this device.");
    } finally {
      setTesting(false);
    }
  };

  // ---- Web Push actions ----
  const enablePush = async () => {
    setPushBusy("subscribe");
    try {
      const result = await subscribeToPush();
      setPushStatus(result.status ?? (await getPushStatus()));
      if (result.ok) toast.success("Push enabled — the server can now reach this device when it is online.");
      else toast.error(result.reason ?? "Push could not be enabled on this device.");
    } catch (err) {
      toast.error((err as Error).message || "Push could not be enabled on this device.");
    } finally {
      setPushBusy(null);
    }
  };

  const disablePush = async () => {
    setPushBusy("unsubscribe");
    try {
      const result = await unsubscribeFromPush();
      setPushStatus(result.status ?? (await getPushStatus()));
      toast.success("Push disabled on this device. In-app reminders are unaffected.");
    } catch (err) {
      toast.error((err as Error).message || "Push could not be disabled.");
    } finally {
      setPushBusy(null);
    }
  };

  const testPush = async () => {
    setPushBusy("test");
    try {
      await apiSend("/api/push/test", "POST");
      toast.success("Test push sent — subscribed, online devices should receive it shortly.");
    } catch (err) {
      toast.error((err as Error).message || "The server could not send the test push.");
    } finally {
      setPushBusy(null);
    }
  };

  const permissionLabel =
    permission === "granted"
      ? "Browser permission: granted"
      : permission === "denied"
        ? "Browser permission: blocked"
        : permission === "unsupported"
          ? "Browser notifications: not supported"
          : "Browser permission: not asked yet";

  const pushBadge = () => {
    if (!pushStatus) return null;
    if (!pushStatus.supported) {
      return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Unsupported in this browser</Badge>;
    }
    if (pushStatus.subscribed) {
      return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">Subscribed</Badge>;
    }
    if (!pushStatus.configured) {
      return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Not configured</Badge>;
    }
    return <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">Not subscribed</Badge>;
  };

  const pushStatusLine = () => {
    if (!pushStatus) return "Checking push support…";
    if (!pushStatus.supported) return "This browser cannot receive Web Push. In-app reminders still work.";
    const server = pushStatus.configured ? "Server: ready" : "Server: not configured (missing keys)";
    const device = pushStatus.subscribed ? "This device: subscribed" : "This device: not subscribed";
    return `${server} · ${device}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4 text-primary" aria-hidden />
          Notifications
        </CardTitle>
        <CardDescription>
          In-app reminders always work — they are computed from your farm data on this device.
          Browser and push notifications are extras that depend on permissions and connectivity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
          <div className="space-y-1">
            <Label htmlFor="set-notif" className="text-sm font-medium">
              Reminder notifications
            </Label>
            <p className="text-xs text-muted-foreground">
              Show task and vaccination reminders inside the app.
            </p>
          </div>
          <Switch
            id="set-notif"
            checked={draft.notificationsEnabled}
            onCheckedChange={(v) => update({ notificationsEnabled: v })}
            aria-label="Enable reminder notifications"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="set-lead">Reminder lead time</Label>
            <Select value={draft.reminderLeadDays} onValueChange={(v) => update({ reminderLeadDays: v })}>
              <SelectTrigger id="set-lead" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d === "0" ? "Same day" : `${d} day${d === "1" ? "" : "s"} before`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Remind me {draft.reminderLeadDays === "0" ? "on the day" : `${draft.reminderLeadDays} day${draft.reminderLeadDays === "1" ? "" : "s"}`} before things are due.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-quiet-start">Quiet hours start</Label>
            <Input id="set-quiet-start" type="time" value={draft.quietHoursStart} onChange={(e) => update({ quietHoursStart: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-quiet-end">Quiet hours end</Label>
            <Input id="set-quiet-end" type="time" value={draft.quietHoursEnd} onChange={(e) => update({ quietHoursEnd: e.target.value })} />
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          While the app is open, reminders are held back during quiet hours. Notifications received while
          the app is closed follow your device settings.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="min-h-11" disabled={testing} onClick={() => void testNotification()}>
            {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            Send test notification
          </Button>
          <span className="text-xs text-muted-foreground">{permissionLabel}</span>
        </div>

        {/* ---------- Web Push (server-delivered, honest about limits) ---------- */}
        <Separator />
        <div className="space-y-2.5 rounded-lg border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <RadioTower className="size-4 text-primary" aria-hidden />
              Web Push — server-delivered reminders
            </p>
            {pushBadge()}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Web Push lets the SERVER deliver reminders while the app is closed — only when this device
            is online. When offline, reminders are shown when you open the app; a PWA cannot guarantee
            alarms while fully closed and cannot set your phone&apos;s native alarm clock or ringtones.
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{pushStatusLine()}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={pushBusy === "check"}
              onClick={() => {
                setPushBusy("check");
                void refreshPush().finally(() => setPushBusy(null));
              }}
            >
              <RefreshCw className={`size-3 ${pushBusy === "check" ? "animate-spin" : ""}`} aria-hidden />
              Check again
            </Button>
          </p>
          {pushStatus?.supported && (
            <div className="flex flex-wrap items-center gap-2">
              {pushStatus.configured && !pushStatus.subscribed && (
                <Button variant="outline" className="min-h-11" disabled={pushBusy !== null} onClick={() => void enablePush()}>
                  {pushBusy === "subscribe" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RadioTower className="size-4" aria-hidden />}
                  Enable push on this device
                </Button>
              )}
              {pushStatus.subscribed && (
                <>
                  <Button variant="outline" className="min-h-11" disabled={pushBusy !== null} onClick={() => void testPush()}>
                    {pushBusy === "test" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                    Send test push
                  </Button>
                  <Button variant="ghost" className="min-h-11" disabled={pushBusy !== null} onClick={() => void disablePush()}>
                    {pushBusy === "unsubscribe" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Disable push
                  </Button>
                </>
              )}
              {!pushStatus.configured && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Push is not configured on this server yet (missing VAPID keys). Local reminders still
                  work — enable push once the server has been set up.
                </p>
              )}
            </div>
          )}
        </div>

        {fieldError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {fieldError}
          </p>
        )}

        <Button className="min-h-11" disabled={patch.isPending || !settings} onClick={save}>
          {patch.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save notification settings
        </Button>
      </CardContent>
    </Card>
  );
}
