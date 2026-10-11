"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  LayoutDashboard, Milk, Sprout, BellRing, CalendarDays, Map as MapIcon, Wallet, BarChart3, BookOpen, Settings as SettingsIcon,
  Menu, Search, Download, Ellipsis, Wifi, WifiOff, ChevronRight, Sparkles, Bird, LifeBuoy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useFarmStore, type FarmView } from "@/components/farm/store";
import { useConnection, useInstallPrompt, useServiceWorker } from "@/components/farm/pwa";
import { apiGet, qk } from "@/lib/api";
import type { FarmSettingsData, SummaryCounts } from "@/lib/farm";
import { greetingForHour } from "@/lib/farm";
import DashboardView from "@/components/farm/dashboard/dashboard-view";
import LivestockView from "@/components/farm/livestock/livestock-view";
import PoultryView from "@/components/farm/poultry/poultry-view";
import CropsView from "@/components/farm/crops/crops-view";
import TasksView from "@/components/farm/tasks/tasks-view";
import CalendarView from "@/components/farm/calendar/calendar-view";
import FarmMapView from "@/components/farm/map/farm-map-view";
import FinancesView from "@/components/farm/finances/finances-view";
import ReportsView from "@/components/farm/reports/reports-view";
import KnowledgeView from "@/components/farm/knowledge/knowledge-view";
import GuideView from "@/components/farm/guide/guide-view";
import SettingsView from "@/components/farm/settings/settings-view";
import OnboardingDialog from "@/components/farm/onboarding/onboarding-dialog";
import { GlobalSearchDialog } from "@/components/farm/search/global-search";
import { FarmAssistantDialog } from "@/components/farm/assistant/assistant-dialog";
import ReminderCenter from "@/components/farm/reminders/reminder-center";
import SyncStatusChip from "@/components/farm/sync/sync-status-chip";
import SplashScreen from "@/components/farm/splash-screen";
import ProfileGate from "@/components/farm/members/profile-gate";
import ProfileChip from "@/components/farm/members/profile-chip";
import ExportDialog from "@/components/farm/export/export-dialog";
import { useMembersStore } from "@/components/farm/members/members-store";

const NAV_ITEMS: { view: FarmView; label: string; icon: React.ElementType; mobile: boolean }[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { view: "livestock", label: "Livestock", icon: Milk, mobile: true },
  { view: "poultry", label: "Poultry", icon: Bird, mobile: false },
  { view: "crops", label: "Crops & Fields", icon: Sprout, mobile: true },
  { view: "tasks", label: "Tasks & Reminders", icon: BellRing, mobile: true },
  { view: "calendar", label: "Calendar", icon: CalendarDays, mobile: false },
  { view: "map", label: "Farm Map", icon: MapIcon, mobile: false },
  { view: "finances", label: "Finances", icon: Wallet, mobile: false },
  { view: "reports", label: "Reports", icon: BarChart3, mobile: false },
  { view: "knowledge", label: "Knowledge Hub", icon: BookOpen, mobile: false },
  { view: "guide", label: "Help & Guide", icon: LifeBuoy, mobile: false },
  { view: "settings", label: "Settings", icon: SettingsIcon, mobile: false },
];

export default function FarmCommandApp() {
  useServiceWorker();
  const activeView = useFarmStore((s) => s.activeView);
  const setView = useFarmStore((s) => s.setView);
  const setSearchOpen = useFarmStore((s) => s.setSearchOpen);
  const setAssistantOpen = useFarmStore((s) => s.setAssistantOpen);
  const connection = useConnection();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeMemberName = useMembersStore((s) => {
    const m = s.members.find((x) => x.id === s.activeId);
    return m?.name ?? null;
  });

  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: () => apiGet<FarmSettingsData>("/api/settings") });
  const { data: summary } = useQuery({
    queryKey: qk.summary,
    queryFn: () => apiGet<SummaryCounts>("/api/summary"),
    refetchInterval: 60_000,
  });

  // Keyboard shortcut for search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  const attentionCount = useMemo(() => {
    if (!summary) return 0;
    return summary.overdueTasks + summary.dueTodayTasks + summary.overdueVaccinations;
  }, [summary]);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const greetingName = activeMemberName ?? settings?.ownerName ?? null;
  const greeting = `${greetingForHour(now.getHours())}${greetingName ? `, ${greetingName}` : ""}`;

  const navButton = (item: (typeof NAV_ITEMS)[number], onClick?: () => void) => {
    const active = activeView === item.view;
    const badgeValue =
      item.view === "tasks" && summary
        ? summary.overdueTasks + summary.dueTodayTasks
        : item.view === "livestock" && summary
          ? summary.livestockTotal
          : undefined;
    const Icon = item.icon;
    return (
      <button
        key={item.view}
        onClick={() => {
          setView(item.view);
          onClick?.();
        }}
        aria-current={active ? "page" : undefined}
        className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-sidebar-ring ${
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-inner"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        }`}
      >
        <Icon className={`size-[18px] shrink-0 ${active ? "text-sidebar-primary" : ""}`} aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        {badgeValue !== undefined && badgeValue > 0 && (
          <Badge
            variant={item.view === "tasks" ? "destructive" : "secondary"}
            className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold"
          >
            {badgeValue}
          </Badge>
        )}
        {active && <ChevronRight className="size-4 text-sidebar-primary" aria-hidden />}
      </button>
    );
  };

  const connectionBadge = (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
        connection === "online"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      }`}
      role="status"
      aria-label={connection === "online" ? "Online" : "Offline — core features keep working"}
    >
      {connection === "online" ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
      {connection === "online" ? "Online" : "Offline — data is safe"}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Branded startup animation (plays once per app launch) */}
      <SplashScreen />
      {/* Family profile gate — "who's using the app" (DJ / Dad / Mom) */}
      <ProfileGate />

      {/* ---------- Desktop sidebar ---------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex print:hidden">
        <div className="flex items-center gap-3 px-5 pb-4 pt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="Farm Command logo" width={40} height={40} className="size-10 rounded-xl shadow-sm" draggable={false} />
          <div>
            <div className="text-sm font-extrabold tracking-wide">FARM COMMAND</div>
            <div className="text-[11px] text-sidebar-foreground/60">Smart Farming. Better Yields.</div>
          </div>
        </div>
        <Separator className="bg-sidebar-border" />
        <nav className="farm-scroll flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => navButton(item))}
        </nav>
        <div className="space-y-3 px-5 pb-5">
          <button
            onClick={() => setAssistantOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-sidebar-primary/30 bg-sidebar-primary/10 px-3.5 py-2.5 text-left text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-primary/20"
          >
            <Sparkles className="size-4 text-sidebar-primary" aria-hidden />
            Ask the Farm Assistant
          </button>
          {connection === "offline" && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-200">
              Offline mode — your records are saved and will be here when you reconnect.
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] text-sidebar-foreground/50">
            <span>Farm Command v1.0</span>
            <span aria-hidden>🇿🇲 Proudly Zambian</span>
          </div>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75 print:hidden">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            {/* Mobile nav trigger */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation menu">
                  <Menu className="size-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 border-sidebar bg-sidebar p-0 text-sidebar-foreground">
                <SheetHeader className="border-b border-sidebar-border px-5 pb-4 pt-5 text-left">
                  <SheetTitle className="flex items-center gap-3 text-sidebar-foreground">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/icon-192.png" alt="Farm Command logo" width={36} height={36} className="size-9 rounded-xl shadow-sm" draggable={false} />
                    <div>
                      <div className="text-sm font-extrabold tracking-wide">FARM COMMAND</div>
                      <div className="text-[11px] font-normal text-sidebar-foreground/60">{settings?.farmName ?? "My Farm"}</div>
                    </div>
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    Navigate to any Farm Command section.
                  </SheetDescription>
                </SheetHeader>
                <nav className="space-y-1 px-3 py-4" aria-label="Mobile navigation">
                  {NAV_ITEMS.map((item) => navButton(item, () => setMobileNavOpen(false)))}
                </nav>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {settings?.farmName ?? "Farm Command"} · {dateLabel}
              </div>
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{greeting} 👋🏾</h1>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="hidden h-9 gap-2 text-muted-foreground sm:flex" onClick={() => setSearchOpen(true)}>
                <Search className="size-4" aria-hidden />
                <span className="hidden md:inline">Search</span>
                <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] md:inline">⌘K</kbd>
              </Button>
              <Button variant="outline" size="icon" className="size-9 sm:hidden" onClick={() => setSearchOpen(true)} aria-label="Search farm records">
                <Search className="size-4" aria-hidden />
              </Button>
              <ReminderCenter />
              <ExportDialog />
              <ProfileChip />
              {canInstall && (
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label="Install Farm Command as an app"
                  onClick={async () => {
                    const outcome = await promptInstall();
                    if (outcome === "accepted") toast.success("Farm Command was installed 🎉");
                    else if (outcome === "dismissed") toast.info("You can install any time from this button.");
                  }}
                >
                  <Download className="size-4" aria-hidden />
                </Button>
              )}
              <SyncStatusChip />
            </div>
          </div>
        </header>

        {/* Active module view — subtle cross-fade between modules */}
        <main className="farm-scroll flex-1 px-4 pb-10 pt-5 sm:px-6" id="main-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              {activeView === "dashboard" && <DashboardView />}
              {activeView === "livestock" && <LivestockView />}
              {activeView === "poultry" && <PoultryView />}
              {activeView === "crops" && <CropsView />}
              {activeView === "tasks" && <TasksView />}
              {activeView === "calendar" && <CalendarView />}
              {activeView === "map" && <FarmMapView />}
              {activeView === "finances" && <FinancesView />}
              {activeView === "reports" && <ReportsView />}
              {activeView === "knowledge" && <KnowledgeView />}
              {activeView === "guide" && <GuideView />}
              {activeView === "settings" && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Sticky footer */}
        <footer className="mt-auto border-t bg-card">
          <div className="flex flex-col items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:px-6">
            <div className="flex items-center gap-2">
              <span aria-hidden>🌾</span>
              <span className="font-medium">Your farm. Your data. Your decisions.</span>
            </div>
            <div className="flex items-center gap-3">
              <span>{settings?.farmName ?? "My Farm"} · v1.0</span>
              <span className="sm:hidden">{connectionBadge}</span>
              <span aria-hidden>🇿🇲</span>
            </div>
          </div>
        </footer>

        {/* Mobile bottom navigation */}
        <nav
          className="sticky bottom-0 z-30 border-t bg-card/95 backdrop-blur lg:hidden print:hidden"
          aria-label="Bottom navigation"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="grid grid-cols-5">
            {NAV_ITEMS.filter((i) => i.mobile).map((item) => {
              const active = activeView === item.view;
              const Icon = item.icon;
              const badge =
                item.view === "tasks" && summary && summary.overdueTasks + summary.dueTodayTasks > 0
                  ? summary.overdueTasks + summary.dueTodayTasks
                  : null;
              return (
                <button
                  key={item.view}
                  onClick={() => setView(item.view)}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-5" aria-hidden />
                  <span className="max-w-full truncate">{item.label.split(" ")[0].replace("&", "")}</span>
                  {badge !== null && (
                    <span className="absolute right-2 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                  {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" aria-hidden />}
                </button>
              );
            })}
            <Sheet>
              <SheetTrigger asChild>
                <button className="flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground" aria-label="More sections">
                  <Ellipsis className="size-5" aria-hidden />
                  <span>More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle>More sections</SheetTitle>
                  <SheetDescription className="sr-only">
                    Open calendar, map, finances, reports, knowledge or settings.
                  </SheetDescription>
                </SheetHeader>
                <div className="grid grid-cols-2 gap-2 pb-6">
                  {NAV_ITEMS.filter((i) => !i.mobile).map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.view}
                        onClick={() => setView(item.view)}
                        className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left text-sm font-medium transition-colors hover:bg-accent"
                      >
                        <Icon className="size-5 text-primary" aria-hidden />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </div>

      {/* Global overlays */}
      <GlobalSearchDialog />
      <OnboardingDialog />
      <FarmAssistantDialog />
    </div>
  );
}

