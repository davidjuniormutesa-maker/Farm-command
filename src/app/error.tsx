"use client";

import { useEffect } from "react";

/**
 * Route-segment error boundary. Catches render/runtime errors in the app so a
 * single failing view degrades to a recoverable message instead of a white
 * screen — important for an offline-first tool people rely on in the field.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled UI error", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A part of Farm Command hit an unexpected error. Your data is safe on this
          device — you can try again.
        </p>
        {error?.digest && (
          <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.assign("/")}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
