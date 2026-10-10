/**
 * Top-level loading fallback shown while a route segment streams in.
 * Intentionally minimal — the app hydrates from IndexedDB almost immediately.
 */
export default function Loading() {
  return (
    <main
      className="min-h-screen flex items-center justify-center bg-background text-foreground"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
          role="status"
          aria-label="Loading"
        />
        <p className="text-sm text-muted-foreground">Loading Farm Command…</p>
      </div>
    </main>
  );
}
