"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiGet, qk } from "@/lib/api";
import type { FarmSettingsData } from "@/lib/farm";
import { FarmProfileCard } from "./farm-profile-card";
import { NotificationsCard } from "./notifications-card";
import { PermissionsCard } from "./permissions-card";
import { DataCard } from "./data-card";
import { OnlineServicesCard } from "./online-services-card";
import { AppearanceCard } from "./appearance-card";
import { AboutCard } from "./about-card";

/**
 * Settings — farm profile, notifications, permissions & devices, data
 * ownership, online services, appearance and about. Cards load their own data
 * through TanStack Query so each one is independent.
 */
export default function SettingsView() {
  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: () => apiGet<FarmSettingsData>("/api/settings") });

  return (
    <div className="space-y-5">
      {/* ---------- Header ---------- */}
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <SettingsIcon className="size-5 text-primary" aria-hidden />
          Settings
        </h2>
        <p className="text-sm text-muted-foreground">Your farm. Your data. Your decisions.</p>
      </div>

      {/* ---------- Cards ---------- */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {settings ? (
          <>
            <FarmProfileCard />
            <NotificationsCard />
            <PermissionsCard />
          </>
        ) : (
          <>
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </>
        )}

        <DataCard />

        {settings ? (
          <>
            <OnlineServicesCard />
            <AppearanceCard />
          </>
        ) : (
          <>
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </>
        )}

        <AboutCard />
      </div>
    </div>
  );
}
