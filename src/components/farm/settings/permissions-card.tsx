"use client";

/**
 * Permissions & Devices — the honest permissions centre.
 *
 * RULES (matching the app's honesty standard):
 * - Nothing is ever requested automatically. Every permission request is
 *   triggered by a button the farmer taps.
 * - Statuses reflect reality: they are re-read from the browser after every
 *   request (see `refresh`).
 * - After a browser DENIES a permission it forbids re-prompting — we show
 *   guidance to the browser's site settings instead of a dead button.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  Camera,
  Loader2,
  MapPin,
  Mic,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, qk } from "@/lib/api";
import type { FarmSettingsData } from "@/lib/farm";
import { usePatchSettings } from "./settings-shared";

// ---------- status model ----------

type PermStatus = "granted" | "denied" | "default" | "unsupported";

const STATUS_META: Record<PermStatus, { label: string; className: string }> = {
  granted: {
    label: "Allowed",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  },
  denied: {
    label: "Denied",
    className:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  },
  default: {
    label: "Not yet requested",
    className:
      "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  },
  unsupported: {
    label: "Unsupported",
    className: "bg-muted text-muted-foreground border-border",
  },
};

function StatusBadge({ status }: { status: PermStatus | null }) {
  if (!status) return <Skeleton className="h-5 w-28 rounded-md" />;
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}

// ---------- status readers (always truthful) ----------

function readNotificationStatus(): PermStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}

async function readGeolocationStatus(): Promise<PermStatus> {
  if (typeof navigator === "undefined") return "default";
  if (!("geolocation" in navigator)) return "unsupported";
  if (!navigator.permissions) return "default"; // no Permissions API → treat as unasked
  try {
    const state = (await navigator.permissions.query({ name: "geolocation" })).state;
    return state === "granted" ? "granted" : state === "denied" ? "denied" : "default";
  } catch {
    return "default";
  }
}

async function readMediaStatus(name: "camera" | "microphone"): Promise<PermStatus> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
  if (!navigator.permissions) return "default";
  try {
    // "camera" / "microphone" are not in the TS lib.dom PermissionName union
    // but are supported by Chromium; Firefox/Safari may throw → caught below.
    const state = (await navigator.permissions.query({ name } as unknown as PermissionDescriptor)).state;
    return state === "granted" ? "granted" : state === "denied" ? "denied" : "default";
  } catch {
    return "default"; // honest fallback: we do not know → "Not yet requested"
  }
}

function describeMediaError(err: unknown, device: "camera" | "microphone"): string {
  const name = err instanceof Error ? err.name : "";
  const label = device === "camera" ? "Camera" : "Microphone";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `${label} access was not allowed. You can change this in your browser's site settings (the padlock icon in the address bar) and test again.`;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return `No ${device} was found on this device.`;
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return `The ${device} seems to be in use by another app. Close it and test again.`;
  }
  return `The ${device} could not be started on this device.`;
}

// ---------- component ----------

interface PermissionRowProps {
  icon: LucideIcon;
  name: string;
  why: string;
  status: PermStatus | null;
  action?: ReactNode;
  extra?: ReactNode;
}

function PermissionRow({ icon: Icon, name, why, status, action, extra }: PermissionRowProps) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden>
            <Icon className="size-4 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">{name}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{why}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <StatusBadge status={status} />
          {action}
        </div>
      </div>
      {extra && <div className="mt-2 sm:pl-12">{extra}</div>}
    </div>
  );
}

export function PermissionsCard() {
  const { data: settings } = useQuery({
    queryKey: qk.settings,
    queryFn: () => apiGet<FarmSettingsData>("/api/settings"),
  });
  const patch = usePatchSettings();

  const [notifStatus, setNotifStatus] = useState<PermStatus | null>(null);
  const [locationStatus, setLocationStatus] = useState<PermStatus | null>(null);
  const [cameraStatus, setCameraStatus] = useState<PermStatus | null>(null);
  const [micStatus, setMicStatus] = useState<PermStatus | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

  // ---- camera test dialog state ----
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ---- microphone test state ----
  const [micState, setMicState] = useState<"idle" | "starting" | "working" | "error">("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTimerRef = useRef<number | null>(null);

  /** Re-read every permission status straight from the browser. */
  const refresh = useCallback(async () => {
    setNotifStatus(readNotificationStatus());
    setLocationStatus(await readGeolocationStatus());
    setCameraStatus(await readMediaStatus("camera"));
    setMicStatus(await readMediaStatus("microphone"));
  }, []);

  useEffect(() => {
    // Deferred a tick: permission reads touch browser APIs and setState —
    // keep them out of the synchronous effect body.
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  // Stop any live media streams when leaving the page.
  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (micTimerRef.current !== null) window.clearTimeout(micTimerRef.current);
    };
  }, []);

  // Attach the camera stream to the <video> element once both exist.
  useEffect(() => {
    if (cameraOpen && videoRef.current && cameraStreamRef.current) {
      if (videoRef.current.srcObject !== cameraStreamRef.current) {
        videoRef.current.srcObject = cameraStreamRef.current;
        void videoRef.current.play().catch(() => {});
      }
    }
  }, [cameraOpen, cameraState]);

  // ---------- notifications ----------

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setNotifStatus("unsupported");
      return;
    }
    try {
      await Notification.requestPermission();
    } catch {
      /* Safari desktop can throw in some modes — refresh shows the truth */
    }
    await refresh();
  };

  const notifAction =
    notifStatus === "default" ? (
      <Button variant="outline" className="min-h-11" onClick={() => void requestNotifications()}>
        <Bell className="size-4" aria-hidden />
        Allow notifications
      </Button>
    ) : undefined;

  const notifExtra =
    notifStatus === "denied" ? (
      <p className="text-xs leading-relaxed text-muted-foreground">
        Notifications are blocked for this site. Open your browser&apos;s site settings (padlock icon in
        the address bar) to allow them.
      </p>
    ) : notifStatus === "unsupported" ? (
      <p className="text-xs leading-relaxed text-muted-foreground">
        This browser does not support notifications. In-app reminders still work everywhere in the app.
      </p>
    ) : undefined;

  // ---------- location ----------

  const requestLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationStatus("unsupported");
      toast.info("This browser does not support location. You can type your farm's location in Farm profile.");
      return;
    }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = Number(pos.coords.latitude.toFixed(5));
        const longitude = Number(pos.coords.longitude.toFixed(5));
        patch.mutate(
          { latitude, longitude },
          {
            onSuccess: () => toast.success("Farm location saved."),
            onError: (err: Error) => toast.error(err.message || "The location could not be saved."),
            onSettled: () => {
              setLocationBusy(false);
              void refresh();
            },
          }
        );
      },
      (err) => {
        setLocationBusy(false);
        void refresh();
        if (err.code === err.PERMISSION_DENIED) {
          toast.warning("Location was not allowed. You can still type your farm's location in Farm profile.");
        } else {
          toast.error("Could not get your location right now. You can type it in Farm profile.");
        }
      },
      { timeout: 10_000, maximumAge: 60_000 }
    );
  };

  const locationAction =
    locationStatus === "denied" || locationStatus === "unsupported" ? undefined : (
      <Button
        variant="outline"
        className="min-h-11"
        disabled={locationBusy || patch.isPending}
        onClick={requestLocation}
      >
        {locationBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
        {locationStatus === "granted" ? "Use my location" : "Share my location"}
      </Button>
    );

  const savedCoords =
    typeof settings?.latitude === "number" && typeof settings?.longitude === "number"
      ? `${settings.latitude}, ${settings.longitude}`
      : null;

  const locationExtra = (
    <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
      {locationStatus === "denied" && (
        <p>
          Location is blocked for this site — open your browser&apos;s site settings (padlock icon in the
          address bar) to allow it. Typing your location manually in Farm profile still works.
        </p>
      )}
      {locationStatus === "unsupported" && (
        <p>This browser does not support location. Typing your location manually in Farm profile works.</p>
      )}
      <p>
        {savedCoords
          ? `Saved farm coordinates: ${savedCoords}. Change them any time in Farm profile.`
          : "No coordinates saved yet — set them in Farm profile or with the button above."}
      </p>
    </div>
  );

  // ---------- camera ----------

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState("idle");
    setCameraError(null);
  };

  const startCamera = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unsupported");
      return;
    }
    setCameraOpen(true);
    setCameraError(null);
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      cameraStreamRef.current = stream;
      setCameraState("live");
      await refresh();
    } catch (err) {
      setCameraError(describeMediaError(err, "camera"));
      setCameraState("error");
      await refresh();
    }
  };

  const cameraAction = (
    <Button variant="outline" className="min-h-11" disabled={cameraStatus === "unsupported"} onClick={() => void startCamera()}>
      <Camera className="size-4" aria-hidden />
      Test camera
    </Button>
  );

  const cameraExtra =
    cameraStatus === "unsupported" ? (
      <p className="text-xs leading-relaxed text-muted-foreground">
        This browser does not offer camera capture — typing records and details still works.
      </p>
    ) : undefined;

  // ---------- microphone ----------

  const stopMic = () => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  };

  const testMicrophone = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicStatus("unsupported");
      return;
    }
    if (micTimerRef.current !== null) window.clearTimeout(micTimerRef.current);
    stopMic();
    setMicError(null);
    setMicState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      // Keep the stream briefly (a real capture test), then report and release it.
      micTimerRef.current = window.setTimeout(() => {
        stopMic();
        setMicState("working");
        void refresh();
      }, 1_500);
      await refresh();
    } catch (err) {
      stopMic();
      setMicError(describeMediaError(err, "microphone"));
      setMicState("error");
      await refresh();
    }
  };

  const micAction = (
    <Button
      variant="outline"
      className="min-h-11"
      disabled={micStatus === "unsupported" || micState === "starting"}
      onClick={() => void testMicrophone()}
    >
      {micState === "starting" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mic className="size-4" aria-hidden />}
      {micState === "starting" ? "Listening…" : "Test microphone"}
    </Button>
  );

  const micExtra =
    micState === "working" ? (
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="size-3.5" aria-hidden />
        Microphone is working — it is only used when you choose to record.
      </p>
    ) : micError ? (
      <p role="alert" className="text-xs leading-relaxed text-destructive">
        {micError}
      </p>
    ) : micStatus === "unsupported" ? (
      <p className="text-xs leading-relaxed text-muted-foreground">
        This browser does not offer audio capture — the assistant works fine by text.
      </p>
    ) : undefined;

  // ---------- render ----------

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          Permissions &amp; devices
        </CardTitle>
        <CardDescription>
          What Farm Command may ask your browser for, and why. Nothing is requested automatically —
          each permission is only asked when you use the feature that needs it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PermissionRow
          icon={Bell}
          name="Notifications"
          why="Used for task and vaccination reminders, and important farm alerts. We only ask when you turn reminders on."
          status={notifStatus}
          action={notifAction}
          extra={notifExtra}
        />
        <Separator />
        <PermissionRow
          icon={MapPin}
          name="Location"
          why="Used to place your farm on the weather forecast. You can also type your location manually — permission is optional."
          status={locationStatus}
          action={locationAction}
          extra={locationExtra}
        />
        <Separator />
        <PermissionRow
          icon={Camera}
          name="Camera"
          why="Used when you choose to take a photo of an animal, crop or receipt. Photos are stored only on your device and sync to your own server — nothing is uploaded without your action."
          status={cameraStatus}
          action={cameraAction}
          extra={cameraExtra}
        />
        <Separator />
        <PermissionRow
          icon={Mic}
          name="Microphone"
          why="Optional voice notes and voice input for the assistant. Not required for any core feature."
          status={micStatus}
          action={micAction}
          extra={micExtra}
        />
      </CardContent>

      {/* ---- Camera test dialog (user-initiated permission request) ---- */}
      <Dialog
        open={cameraOpen}
        onOpenChange={(next) => {
          if (!next) stopCamera();
          setCameraOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Test camera</DialogTitle>
            <DialogDescription>
              Your browser will ask for camera access. The picture stays on this device — nothing is
              recorded or uploaded.
            </DialogDescription>
          </DialogHeader>
          {cameraError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive">
              {cameraError}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-lg border bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full" />
              {cameraState === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm text-white">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Starting camera…
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {cameraState === "live" ? (
              <Button variant="secondary" className="min-h-11" onClick={stopCamera}>
                Stop camera
              </Button>
            ) : (
              <Button variant="outline" className="min-h-11" onClick={() => setCameraOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
