"use client";

import { useEffect, useState } from "react";

/**
 * Unlock screen for the optional access gate (see src/middleware.ts).
 * Shown only when the server is configured with FARM_ACCESS_TOKEN and the
 * device has not unlocked yet. Submits the code to /api/unlock, which sets an
 * httpOnly cookie; the browser then carries it on every request automatically.
 */
export default function UnlockPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get("next");
    if (n && n.startsWith("/")) setNext(n);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.assign(next);
        return;
      }
      setError(data?.error ?? "Could not unlock. Try again.");
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Farm Command</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This device is protected. Enter your farm access code to continue.
        </p>

        <label htmlFor="code" className="mt-6 block text-sm font-medium">
          Access code
        </label>
        <input
          id="code"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || code.length === 0}
          className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>

        <p className="mt-4 text-xs text-muted-foreground">
          Your data stays on this device and syncs only to your own server.
        </p>
      </form>
    </main>
  );
}
