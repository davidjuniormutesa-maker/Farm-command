"use client";

import { create } from "zustand";
import {
  loadMembers,
  getActiveMemberId,
  setActiveMemberId,
  addMember as addMemberDb,
  updateMember as updateMemberDb,
  removeMember as removeMemberDb,
  setMemberPin as setMemberPinDb,
  type FamilyMember,
  type MemberRole,
} from "@/lib/offline/members";

const SESSION_KEY = "fc_member_session"; // which member id is unlocked this launch

function sessionUnlocked(id: string): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === id;
  } catch {
    return false;
  }
}

function markSessionUnlocked(id: string | null) {
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

interface MembersStore {
  loaded: boolean;
  members: FamilyMember[];
  activeId: string | null;
  /** The profile overlay is visible (pick / PIN / first-run setup). */
  gateOpen: boolean;
  /** Manage-profiles sheet (add / edit / remove). */
  manageOpen: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  activeMember: () => FamilyMember | null;

  chooseMember: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  openGate: () => void;
  closeGate: () => void;
  setManageOpen: (open: boolean) => void;

  addMember: (input: { name: string; role?: MemberRole; color?: string; pin?: string }) => Promise<FamilyMember>;
  updateMember: (id: string, patch: { name?: string; role?: MemberRole; color?: string }) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  setMemberPin: (id: string, pin: string | null) => Promise<void>;
}

export const useMembersStore = create<MembersStore>((set, get) => ({
  loaded: false,
  members: [],
  activeId: null,
  gateOpen: false,
  manageOpen: false,

  init: async () => {
    const [members, activeId] = await Promise.all([loadMembers(), getActiveMemberId()]);
    // Decide whether the gate must open on launch.
    let gateOpen = false;
    if (members.length === 0) {
      gateOpen = true; // first run — set up the family
    } else if (!activeId || !members.some((m) => m.id === activeId)) {
      gateOpen = true; // nobody chosen yet (or stale id)
    } else {
      const active = members.find((m) => m.id === activeId)!;
      const needsPin = Boolean(active.pinHash && active.pinSalt);
      if (needsPin && !sessionUnlocked(active.id)) gateOpen = true;
      else markSessionUnlocked(active.id);
    }
    set({ members, activeId: activeId ?? null, loaded: true, gateOpen });
  },

  refresh: async () => {
    const [members, activeId] = await Promise.all([loadMembers(), getActiveMemberId()]);
    set({ members, activeId: activeId ?? null });
  },

  activeMember: () => {
    const { members, activeId } = get();
    return members.find((m) => m.id === activeId) ?? null;
  },

  chooseMember: async (id) => {
    await setActiveMemberId(id);
    markSessionUnlocked(id);
    set({ activeId: id, gateOpen: false });
  },

  signOut: async () => {
    markSessionUnlocked(null);
    set({ gateOpen: true });
  },

  openGate: () => set({ gateOpen: true }),
  closeGate: () => set({ gateOpen: false }),
  setManageOpen: (open) => set({ manageOpen: open }),

  addMember: async (input) => {
    const m = await addMemberDb(input);
    await get().refresh();
    return m;
  },
  updateMember: async (id, patch) => {
    await updateMemberDb(id, patch);
    await get().refresh();
  },
  removeMember: async (id) => {
    await removeMemberDb(id);
    await get().refresh();
  },
  setMemberPin: async (id, pin) => {
    await setMemberPinDb(id, pin);
    await get().refresh();
  },
}));
