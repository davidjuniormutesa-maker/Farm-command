"use client";

/** Standard "nothing recorded yet" message for report cards (also renders on print). */
export function EmptyStateMessage({
  message = "No data yet — records will appear here as you use Farm Command.",
}: {
  message?: string;
}) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}
