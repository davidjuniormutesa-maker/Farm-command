"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LogOut, Plus, Pencil, Trash2, KeyRound, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMembersStore } from "./members-store";
import { initialsOf, memberHasPin, ROLE_LABELS, type FamilyMember } from "@/lib/offline/members";

function Avatar({ member, size = 32 }: { member: FamilyMember; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg font-bold text-white"
      style={{ width: size, height: size, background: member.color, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initialsOf(member.name)}
    </span>
  );
}

export default function ProfileChip() {
  const [open, setOpen] = useState(false);
  const members = useMembersStore((s) => s.members);
  const activeId = useMembersStore((s) => s.activeId);
  const signOut = useMembersStore((s) => s.signOut);
  const openGate = useMembersStore((s) => s.openGate);
  const active = members.find((m) => m.id === activeId) ?? null;

  if (!active) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border bg-card px-1.5 py-1 pr-2.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={`Signed in as ${active.name}. Open profile menu.`}
        >
          <Avatar member={active} size={28} />
          <span className="hidden max-w-[8rem] truncate sm:inline">{active.name}</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Profiles</SheetTitle>
          <SheetDescription className="sr-only">Switch user or manage family profiles.</SheetDescription>
        </SheetHeader>

        <div className="mt-2 flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
          <Avatar member={active} size={44} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{active.name}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABELS[active.role]} · using this device</div>
          </div>
        </div>

        <Button
          variant="outline"
          className="mt-3 w-full gap-2"
          onClick={() => {
            setOpen(false);
            void signOut();
          }}
        >
          <LogOut className="size-4" aria-hidden /> Switch user
        </Button>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">All profiles</span>
          <button
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            onClick={() => {
              setOpen(false);
              openGate();
            }}
          >
            <Plus className="size-3.5" aria-hidden /> Add
          </button>
        </div>

        <div className="mt-2 space-y-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
          {members.map((m) => (
            <ManageRow key={m.id} member={m} isActive={m.id === activeId} canRemove={members.length > 1} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ManageRow({
  member,
  isActive,
  canRemove,
}: {
  member: FamilyMember;
  isActive: boolean;
  canRemove: boolean;
}) {
  const updateMember = useMembersStore((s) => s.updateMember);
  const removeMember = useMembersStore((s) => s.removeMember);
  const setMemberPin = useMembersStore((s) => s.setMemberPin);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [pinMode, setPinMode] = useState(false);
  const [pin, setPin] = useState("");

  return (
    <div className="rounded-xl border bg-card p-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar member={member} size={34} />
        {editing ? (
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className="h-8"
          />
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate text-sm font-medium">
              {member.name}
              {isActive && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">You</span>}
              {memberHasPin(member) && <KeyRound className="size-3 text-muted-foreground" aria-label="PIN set" />}
            </div>
            <div className="text-[11px] text-muted-foreground">{ROLE_LABELS[member.role]}</div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {editing ? (
            <>
              <button
                className="rounded p-1 text-emerald-600 hover:bg-accent"
                aria-label="Save name"
                onClick={async () => {
                  await updateMember(member.id, { name });
                  setEditing(false);
                  toast.success("Profile updated");
                }}
              >
                <Check className="size-4" aria-hidden />
              </button>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label="Cancel"
                onClick={() => {
                  setName(member.name);
                  setEditing(false);
                }}
              >
                <X className="size-4" aria-hidden />
              </button>
            </>
          ) : (
            <>
              <button className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Rename" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden />
              </button>
              <button
                className="rounded p-1 text-muted-foreground hover:bg-accent"
                aria-label={memberHasPin(member) ? "Change or remove PIN" : "Set PIN"}
                onClick={() => {
                  setPin("");
                  setPinMode((v) => !v);
                }}
              >
                <KeyRound className="size-3.5" aria-hidden />
              </button>
              {canRemove && (
                <button
                  className="rounded p-1 text-destructive hover:bg-destructive/10"
                  aria-label="Remove profile"
                  onClick={async () => {
                    if (confirm(`Remove ${member.name}'s profile? Farm data is NOT deleted.`)) {
                      await removeMember(member.id);
                      toast.success("Profile removed");
                    }
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {pinMode && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={memberHasPin(member) ? "New PIN (blank = remove)" : "Set a PIN"}
            className="h-8"
          />
          <Button
            size="sm"
            className="h-8"
            onClick={async () => {
              await setMemberPin(member.id, pin.length > 0 ? pin : null);
              setPinMode(false);
              setPin("");
              toast.success(pin.length > 0 ? "PIN set" : "PIN removed");
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
