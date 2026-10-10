"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { onDataChanged } from "@/lib/offline/outbox";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // The offline data layer signals after local writes / sync pulls; refetch
  // everything so the UI always mirrors the local database.
  useEffect(() => {
    return onDataChanged(() => {
      void queryClient.invalidateQueries();
    });
  }, [queryClient]);

  // Start the sync engine + reminder engine once the app shell is alive.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ initSyncEngine }, { initReminderEngine }] = await Promise.all([
        import("@/lib/offline/sync"),
        import("@/lib/offline/reminders"),
      ]);
      if (cancelled) return;
      initSyncEngine();
      initReminderEngine();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
