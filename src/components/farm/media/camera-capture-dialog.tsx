"use client";

/**
 * CameraCaptureDialog — genuine camera photo capture (Task r7-a).
 *
 * RULES (matching the app's honesty standard and the promise made in
 * Settings → Permissions & devices):
 * - The camera is only started while the dialog is open — never on mount.
 * - Every exit path (capture, Close button, Escape, overlay click, unmount)
 *   stops all media tracks before anything else happens.
 * - Honest failure states: no browser support, permission denied, no camera
 *   found, or any other readable reason — never a dead button.
 * - The captured frame is drawn to an offscreen canvas (longer edge max
 *   1024px, aspect preserved) and handed up as a JPEG data URL. It stays on
 *   the device until the record is saved (then it syncs to the user's own
 *   server via the offline-first facade).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Phase = "starting" | "ready" | "denied" | "error" | "unsupported";

interface CameraCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with a JPEG data URL once the farmer takes the photo. */
  onCapture: (dataUrl: string) => void;
}

/** The longer edge of the captured photo is scaled down to at most this. */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.82;

function describeCameraError(err: unknown): { phase: Phase; message: string } {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      phase: "denied",
      message:
        "Camera access was blocked. Allow it in your browser's site settings (padlock icon), or upload a photo file instead.",
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { phase: "error", message: "No camera was found on this device." };
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return {
      phase: "error",
      message: "The camera seems to be in use by another app. Close it and try again.",
    };
  }
  return {
    phase: "error",
    message:
      err instanceof Error && err.message
        ? `The camera could not be started: ${err.message}`
        : "The camera could not be started on this device.",
  };
}

export function CameraCaptureDialog({ open, onOpenChange, onCapture }: CameraCaptureDialogProps) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [captureHint, setCaptureHint] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start the camera exactly when the dialog opens; stop it on close/unmount.
  // The start is deferred a tick (same pattern as permissions-card) so the
  // effect body itself never calls setState synchronously.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setErrorMessage(null);
      setCaptureHint(null);
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setPhase("unsupported");
        return;
      }
      setPhase("starting");
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" }, audio: false })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          setPhase("ready");
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          stopStream();
          const described = describeCameraError(err);
          setErrorMessage(described.message);
          setPhase(described.phase);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stopStream();
    };
  }, [open, stopStream]);

  // Attach the live stream once both the stream and the <video> element exist.
  useEffect(() => {
    if (open && phase === "ready" && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        void videoRef.current.play().catch(() => {});
      }
    }
  }, [open, phase]);

  /** Every exit path releases the camera before telling the parent. */
  const handleClose = useCallback(() => {
    stopStream();
    setPhase("starting"); // reset so a re-open never flashes stale UI
    setErrorMessage(null);
    setCaptureHint(null);
    onOpenChange(false);
  }, [onOpenChange, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCaptureHint("The camera is still starting — give it a second and try again.");
      return;
    }
    // Scale so the LONGER edge is max 1024px, preserving aspect ratio.
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCaptureHint("This browser could not process the photo — upload a photo file instead.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    stopStream();
    onCapture(dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Take a photo</DialogTitle>
          <DialogDescription>
            Your browser will ask for camera access. The photo stays on this device — it is
            attached to the record and only synced when you save.
          </DialogDescription>
        </DialogHeader>

        {phase === "unsupported" ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive">
            Your browser does not support camera capture — upload a photo file instead.
          </p>
        ) : phase === "denied" || phase === "error" ? (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive">
            {errorMessage}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="aspect-[4/3] w-full rounded-xl bg-black object-cover"
                aria-label="Live camera preview"
              />
              {phase === "starting" && (
                <div
                  className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm text-white"
                  aria-live="polite"
                >
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Starting camera…
                </div>
              )}
            </div>
            {captureHint && (
              <p role="alert" className="text-xs leading-relaxed text-muted-foreground">
                {captureHint}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={handleClose}>
            Close
          </Button>
          {phase === "ready" && (
            <Button
              type="button"
              className="min-h-11"
              aria-label="Take photo"
              onClick={handleCapture}
            >
              <Camera className="size-4" aria-hidden />
              Take photo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
