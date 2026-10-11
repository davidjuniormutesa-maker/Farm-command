"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Farm Command startup animation.
 *
 * Shows a branded full-screen splash with the app logo when the app is first
 * opened (cold start), then fades away to reveal the app. It only plays once
 * per browser session (sessionStorage), so moving between sections inside the
 * app never re-triggers it. Fully respects prefers-reduced-motion: motion-shy
 * users get a simple, quick fade instead of the animated reveal.
 */
export default function SplashScreen() {
  // Start hidden; we decide on mount (client-only) whether to play, so the
  // splash is never server-rendered and never blocks hydration.
  const [show, setShow] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (typeof window === "undefined") return;
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem("fc_splash_shown") === "1";
    } catch {
      // Private mode / storage blocked — just show it, it's harmless.
    }
    if (alreadyShown) return;

    setShow(true);
    try {
      sessionStorage.setItem("fc_splash_shown", "1");
    } catch {
      /* ignore */
    }

    const ms = reduceMotion ? 900 : 2000;
    const timer = setTimeout(() => setShow(false), ms);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="fc-splash"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{
            background:
              "radial-gradient(130% 100% at 50% 35%, #15503c 0%, #0f3b2e 55%, #0a2a20 100%)",
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingTop: "env(safe-area-inset-top)",
          }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.3 : 0.55, ease: "easeInOut" }}
          role="status"
          aria-label="Farm Command is starting"
        >
          {/* Logo */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.72 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            transition={{ duration: reduceMotion ? 0.4 : 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Soft glow halo behind the badge */}
            {!reduceMotion && (
              <motion.span
                aria-hidden
                className="absolute rounded-full"
                style={{
                  width: 220,
                  height: 220,
                  background:
                    "radial-gradient(circle, rgba(212,163,55,0.35) 0%, rgba(212,163,55,0) 70%)",
                }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 0.9, 0.55], scale: [0.6, 1.15, 1] }}
                transition={{ duration: 1.6, ease: "easeOut" }}
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <motion.img
              src="/icons/icon-512.png"
              alt="Farm Command logo"
              width={148}
              height={148}
              className="relative h-[148px] w-[148px] rounded-[28px] shadow-2xl"
              initial={reduceMotion ? false : { rotate: -4 }}
              animate={reduceMotion ? undefined : { rotate: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              draggable={false}
            />
          </motion.div>

          {/* Wordmark */}
          <motion.div
            className="mt-7 flex flex-col items-center"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: reduceMotion ? 0.1 : 0.45, ease: "easeOut" }}
          >
            <div className="text-xl font-extrabold tracking-[0.18em] text-[#f3e9cf]">
              FARM COMMAND
            </div>
            <div className="mt-1.5 text-[12px] font-medium tracking-wide text-[#d4a337]">
              Smart Farming. Better Yields.
            </div>
          </motion.div>

          {/* Loading shimmer bar */}
          {!reduceMotion && (
            <div className="mt-9 h-1 w-40 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full w-1/3 rounded-full"
                style={{ background: "linear-gradient(90deg,#60a94a,#d4a337)" }}
                initial={{ x: "-120%" }}
                animate={{ x: "360%" }}
                transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          )}

          <motion.div
            className="absolute bottom-7 flex items-center gap-1.5 text-[11px] font-medium text-white/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <span aria-hidden>🇿🇲</span>
            <span>Proudly Zambian</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
