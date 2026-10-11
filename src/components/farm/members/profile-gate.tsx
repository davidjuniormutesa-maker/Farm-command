"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, ArrowLeft, UserRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMembersStore } from "./members-store";
import {
  initialsOf,
  memberHasPin,
  verifyPin,
  ROLE_LABELS,
  type FamilyMember,
  type MemberRole,
} from "@/lib/offline/members";

type Mode = "pick" | "pin" | "add";

export default function ProfileGate() {
  const { loaded, members, gateOpen, init, chooseMember, addMember } = useMembersStore();
  const [mode, setMode] = useState<Mode>("pick");
  const [target, setTarget] = useState<FamilyMember | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const didInit = useRef(false);

  // Load profiles once on mount.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void init();
  }, [init]);

  // First run (no profiles yet) → jump straight to the add form.
  useEffect(() => {
    if (gateOpen && loaded && members.length === 0) setMode("add");
  }, [gateOpen, loaded, members.length]);

  if (!gateOpen) return null;

  async function onPick(m: FamilyMember) {
    if (memberHasPin(m)) {
      setTarget(m);
      setPin("");
      setPinError(null);
      setMode("pin");
    } else {
      await chooseMember(m.id);
      toast.success(`Welcome, ${m.name} 👋`);
    }
  }

  async function onSubmitPin(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    const ok = await verifyPin(target, pin);
    if (!ok) {
      setPinError("Wrong PIN. Try again.");
      setPin("");
      return;
    }
    await chooseMember(target.id);
    toast.success(`Welcome back, ${target.name} 👋`);
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-5"
      style={{
        background:
          "radial-gradient(130% 100% at 50% 30%, #15503c 0%, #0f3b2e 55%, #0a2a20 100%)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Choose who is using Farm Command"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-sm"
        >
          {mode === "pick" && (
            <PickView
              members={members}
              onPick={onPick}
              onAdd={() => setMode("add")}
            />
          )}
          {mode === "pin" && target && (
            <PinView
              member={target}
              pin={pin}
              setPin={setPin}
              error={pinError}
              onBack={() => {
                setMode("pick");
                setPinError(null);
              }}
              onSubmit={onSubmitPin}
            />
          )}
          {mode === "add" && (
            <AddView
              firstRun={members.length === 0}
              onBack={members.length === 0 ? null : () => setMode("pick")}
              onAdd={async (name, role, pinValue) => {
                const m = await addMember({ name, role, pin: pinValue || undefined });
                toast.success(`Added ${m.name}`);
                setMode("pick");
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Avatar({ member, size = 56 }: { member: FamilyMember; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold text-white"
      style={{ width: size, height: size, background: member.color, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initialsOf(member.name)}
    </span>
  );
}

function PickView({
  members,
  onPick,
  onAdd,
}: {
  members: FamilyMember[];
  onPick: (m: FamilyMember) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <h2 className="text-center text-lg font-bold text-[#f3e9cf]">Who&apos;s using Farm Command?</h2>
      <p className="mt-1 text-center text-sm text-white/60">Tap your profile to continue.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => onPick(m)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-4 text-center transition-colors hover:border-white/25 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-[#d4a337]"
          >
            <Avatar member={m} />
            <span className="flex items-center gap-1 text-sm font-semibold text-[#f3e9cf]">
              {m.name}
              {memberHasPin(m) && <ShieldCheck className="size-3.5 text-[#d4a337]" aria-label="PIN protected" />}
            </span>
            <span className="text-[11px] text-white/50">{ROLE_LABELS[m.role]}</span>
          </button>
        ))}
        <button
          onClick={onAdd}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 px-3 py-4 text-white/70 transition-colors hover:border-white/40 hover:text-white focus-visible:outline-2 focus-visible:outline-[#d4a337]"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/5">
            <Plus className="size-6" aria-hidden />
          </span>
          <span className="text-sm font-medium">Add profile</span>
        </button>
      </div>
    </div>
  );
}

function PinView({
  member,
  pin,
  setPin,
  error,
  onBack,
  onSubmit,
}: {
  member: FamilyMember;
  pin: string;
  setPin: (v: string) => void;
  error: string | null;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-sm text-white/60 hover:text-white">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </button>
      <div className="flex flex-col items-center gap-3">
        <Avatar member={member} size={64} />
        <div className="text-center">
          <div className="text-base font-bold text-[#f3e9cf]">{member.name}</div>
          <div className="text-[11px] text-white/50">Enter your PIN to continue</div>
        </div>
      </div>
      <Input
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="PIN"
        className="mt-5 border-white/15 bg-white/5 text-center text-lg tracking-[0.4em] text-white placeholder:tracking-normal placeholder:text-white/40"
      />
      {error && <p role="alert" className="mt-2 text-center text-sm text-red-300">{error}</p>}
      <Button type="submit" disabled={pin.length === 0} className="mt-4 w-full bg-[#d4a337] text-[#0f3b2e] hover:bg-[#e0b24f]">
        Unlock
      </Button>
    </form>
  );
}

function AddView({
  firstRun,
  onBack,
  onAdd,
}: {
  firstRun: boolean;
  onBack: (() => void) | null;
  onAdd: (name: string, role: MemberRole, pin: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>(firstRun ? "owner" : "family");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const roles: MemberRole[] = ["owner", "family", "worker"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onAdd(name, role, pin);
      setName("");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1 text-sm text-white/60 hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
      )}
      <div className="flex items-center gap-2 text-[#f3e9cf]">
        <UserRound className="size-5 text-[#d4a337]" aria-hidden />
        <h2 className="text-lg font-bold">{firstRun ? "Set up your family" : "Add a profile"}</h2>
      </div>
      <p className="mt-1 text-sm text-white/60">
        {firstRun
          ? "Add the people who use this farm — e.g. you, Dad, Mom. You can add more later."
          : "Give the profile a name and role."}
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <Label htmlFor="m-name" className="text-white/80">Name</Label>
          <Input
            id="m-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. DJ, Dad, Mom"
            className="mt-1 border-white/15 bg-white/5 text-white placeholder:text-white/40"
          />
        </div>
        <div>
          <Label className="text-white/80">Role</Label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-xl border px-2 py-2 text-sm font-medium transition-colors ${
                  role === r
                    ? "border-[#d4a337] bg-[#d4a337]/15 text-[#f3e9cf]"
                    : "border-white/15 text-white/70 hover:border-white/30"
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="m-pin" className="text-white/80">PIN (optional)</Label>
          <Input
            id="m-pin"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Leave blank for no PIN"
            className="mt-1 border-white/15 bg-white/5 text-white placeholder:text-white/40"
          />
          <p className="mt-1 text-[11px] text-white/45">A soft lock so family members don&apos;t open the wrong profile.</p>
        </div>
      </div>

      <Button type="submit" disabled={busy || !name.trim()} className="mt-5 w-full bg-[#d4a337] text-[#0f3b2e] hover:bg-[#e0b24f]">
        {busy ? "Saving…" : firstRun ? "Add profile" : "Save profile"}
      </Button>
    </form>
  );
}
