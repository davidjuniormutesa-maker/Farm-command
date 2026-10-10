"use client";

import { create } from "zustand";

export type FarmView =
  | "dashboard"
  | "livestock"
  | "poultry"
  | "crops"
  | "tasks"
  | "calendar"
  | "map"
  | "finances"
  | "reports"
  | "knowledge"
  | "settings";

export type QuickAction =
  | "add-animal"
  | "add-group"
  | "add-flock"
  | "add-field"
  | "add-crop"
  | "add-task"
  | "add-transaction"
  | "add-health-event"
  | "record-harvest"
  | null;

interface FarmStore {
  activeView: FarmView;
  quickAction: QuickAction;
  searchOpen: boolean;
  assistantOpen: boolean;
  setView: (view: FarmView) => void;
  requestQuickAction: (action: Exclude<QuickAction, null>) => void;
  consumeQuickAction: () => void;
  setSearchOpen: (open: boolean) => void;
  setAssistantOpen: (open: boolean) => void;
}

export const useFarmStore = create<FarmStore>((set) => ({
  activeView: "dashboard",
  quickAction: null,
  searchOpen: false,
  assistantOpen: false,
  setView: (view) => set({ activeView: view }),
  requestQuickAction: (action) => set({ quickAction: action }),
  consumeQuickAction: () => set({ quickAction: null }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setAssistantOpen: (open) => set({ assistantOpen: open }),
}));

export const VIEW_TITLES: Record<FarmView, string> = {
  dashboard: "Dashboard",
  livestock: "Livestock",
  poultry: "Poultry",
  crops: "Crops & Fields",
  tasks: "Tasks & Reminders",
  calendar: "Calendar",
  map: "Farm Map",
  finances: "Finances",
  reports: "Reports",
  knowledge: "Knowledge Hub",
  settings: "Settings",
};
