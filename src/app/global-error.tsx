"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary that also catches errors thrown in the root layout.
 * It must render its own <html>/<body> because it replaces the layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal app error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0f3b2e",
          color: "#f7faf8",
          margin: 0,
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Farm Command could not start</h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", opacity: 0.85 }}>
            An unexpected error stopped the app from loading. Your saved data is not
            affected. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              borderRadius: 8,
              border: "none",
              background: "#f7faf8",
              color: "#0f3b2e",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
