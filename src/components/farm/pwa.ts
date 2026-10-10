"use client";

import { useEffect, useState, useCallback } from "react";

/** Registers the Farm Command service worker (production + dev). */
export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
}

export type ConnectionState = "online" | "offline";

/** True when the browser reports connectivity; re-evaluates on events. */
export function useConnection(): ConnectionState {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online ? "online" : "offline";
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Install prompt for the PWA (Chromium). */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const standaloneTimer = setTimeout(() => {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    }, 0);
    return () => {
      clearTimeout(standaloneTimer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferred) return "unavailable";
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferred(null);
    return choice.outcome;
  }, [deferred]);

  return { canInstall: Boolean(deferred) && !installed, installed, promptInstall };
}

/** Browser notification permission helpers — graceful, never fake scheduling. */
export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = setTimeout(() => {
      if (!("Notification" in window)) {
        setPermission("unsupported");
        return;
      }
      setPermission(Notification.permission);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission | "unsupported"> => {
    if (!("Notification" in window)) return "unsupported";
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const sendTestNotification = useCallback((): boolean => {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    try {
      new Notification("Farm Command", {
        body: "Test reminder — notifications are working on this device. ✅",
        icon: "/icons/icon-192.png",
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  return { permission, requestPermission, sendTestNotification };
}
