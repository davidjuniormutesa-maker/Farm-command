/**
 * Farm Command — family member profiles ("who is using the app").
 *
 * This is a lightweight, OFFLINE, DEVICE-LOCAL user system: it lets the app
 * know whether DJ, Dad or Mom is the person currently using it. Profiles and
 * the currently-active profile are stored in the Dexie `meta` key/value table
 * (the same place the sync engine keeps small non-critical UI prefs), so there
 * is no server model, no migration and no network dependency — it works fully
 * offline and never blocks the existing data sync.
 *
 * Security note (honest): the optional per-profile PIN is a *soft* lock meant
 * to stop a family member tapping into the wrong profile by accident. The PIN
 * is salted + SHA-256 hashed (never stored in plain text), but because the
 * whole app runs on the device, this is NOT hardened authentication — the
 * device-level access code (FARM_ACCESS_TOKEN gate) remains the real lock.
 */

import { getMeta, setMeta, delMeta, newId, nowIso } from "./db";

export type MemberRole = "owner" | "family" | "worker";

export interface FamilyMember {
  id: string;
  name: string;
  role: MemberRole;
  /** Tailwind-ish accent colour (hex) used for the avatar bubble. */
  color: string;
  /** Optional soft PIN. When set, switching to this profile asks for it. */
  pinSalt?: string;
  pinHash?: string;
  createdAt: string;
  updatedAt: string;
}

const MEMBERS_KEY = "familyMembers";
const ACTIVE_KEY = "activeMemberId";

/** Pleasant default avatar colours, assigned round-robin to new profiles. */
export const MEMBER_COLORS = [
  "#0f3b2e", // forest green
  "#d4a337", // harvest gold
  "#2563eb", // blue
  "#9333ea", // purple
  "#dc2626", // red
  "#0891b2", // teal
  "#ea580c", // orange
  "#4d7c0f", // olive
];

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  family: "Family",
  worker: "Worker",
};

/** First letter(s) of a name for the avatar bubble. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------- storage ----------

export async function loadMembers(): Promise<FamilyMember[]> {
  const raw = await getMeta(MEMBERS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMember);
  } catch {
    return [];
  }
}

async function persistMembers(members: FamilyMember[]): Promise<void> {
  await setMeta(MEMBERS_KEY, JSON.stringify(members));
}

export async function getActiveMemberId(): Promise<string | null> {
  return getMeta(ACTIVE_KEY);
}

export async function setActiveMemberId(id: string | null): Promise<void> {
  if (id) await setMeta(ACTIVE_KEY, id);
  else await delMeta(ACTIVE_KEY);
}

function isMember(v: unknown): v is FamilyMember {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as FamilyMember).id === "string" &&
    typeof (v as FamilyMember).name === "string"
  );
}

// ---------- CRUD ----------

export async function addMember(input: {
  name: string;
  role?: MemberRole;
  color?: string;
  pin?: string;
}): Promise<FamilyMember> {
  const members = await loadMembers();
  const color = input.color ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length];
  const now = nowIso();
  const member: FamilyMember = {
    id: newId(),
    name: input.name.trim() || "New profile",
    role: input.role ?? (members.length === 0 ? "owner" : "family"),
    color,
    createdAt: now,
    updatedAt: now,
  };
  if (input.pin && input.pin.length > 0) {
    const { salt, hash } = await hashPin(input.pin);
    member.pinSalt = salt;
    member.pinHash = hash;
  }
  await persistMembers([...members, member]);
  return member;
}

export async function updateMember(
  id: string,
  patch: { name?: string; role?: MemberRole; color?: string }
): Promise<void> {
  const members = await loadMembers();
  const next = members.map((m) =>
    m.id === id
      ? {
          ...m,
          ...(patch.name !== undefined ? { name: patch.name.trim() || m.name } : {}),
          ...(patch.role !== undefined ? { role: patch.role } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          updatedAt: nowIso(),
        }
      : m
  );
  await persistMembers(next);
}

export async function removeMember(id: string): Promise<void> {
  const members = await loadMembers();
  await persistMembers(members.filter((m) => m.id !== id));
  const active = await getActiveMemberId();
  if (active === id) await setActiveMemberId(null);
}

// ---------- PIN helpers ----------

export async function setMemberPin(id: string, pin: string | null): Promise<void> {
  const members = await loadMembers();
  const next = await Promise.all(
    members.map(async (m) => {
      if (m.id !== id) return m;
      if (!pin) {
        const { pinSalt, pinHash, ...rest } = m;
        void pinSalt;
        void pinHash;
        return { ...rest, updatedAt: nowIso() } as FamilyMember;
      }
      const { salt, hash } = await hashPin(pin);
      return { ...m, pinSalt: salt, pinHash: hash, updatedAt: nowIso() };
    })
  );
  await persistMembers(next);
}

export function memberHasPin(m: FamilyMember): boolean {
  return Boolean(m.pinHash && m.pinSalt);
}

export async function verifyPin(m: FamilyMember, pin: string): Promise<boolean> {
  if (!memberHasPin(m)) return true;
  const { hash } = await hashPin(pin, m.pinSalt);
  return hash === m.pinHash;
}

/** Salted SHA-256 of a PIN. Uses Web Crypto; falls back to a weak hash only
 *  if SubtleCrypto is unavailable (very old browsers) so the app never breaks. */
async function hashPin(pin: string, existingSalt?: string): Promise<{ salt: string; hash: string }> {
  const salt = existingSalt ?? randomSalt();
  const data = `${salt}:${pin}`;
  try {
    const enc = new TextEncoder().encode(data);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return { salt, hash };
  } catch {
    // Fallback: non-cryptographic, better than plaintext for a soft family lock.
    let h = 0;
    for (let i = 0; i < data.length; i++) h = (Math.imul(31, h) + data.charCodeAt(i)) | 0;
    return { salt, hash: `w${(h >>> 0).toString(16)}` };
  }
}

function randomSalt(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 18);
}
