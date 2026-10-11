"use client";

/**
 * PresetPickerDialog — guided "what are you adding?" step shown before the
 * group form. Instead of a blank form, the user taps a friendly animal tile and
 * the Add-group form opens pre-filled with that species and a suggested name.
 *
 * Poultry has its own dedicated section, so that tile routes there rather than
 * creating a livestock group.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface LivestockPreset {
  /** Species value stored on the group (must match SPECIES in farm.ts). */
  species: string;
  /** Big friendly emoji shown on the tile. */
  emoji: string;
  /** Tile heading. */
  label: string;
  /** One-line helper under the heading. */
  hint: string;
  /** Suggested starting group name pre-filled in the form. */
  suggestedName: string;
  /** When true, this tile routes to the Poultry section instead of the form. */
  routeToPoultry?: boolean;
}

export const LIVESTOCK_PRESETS: LivestockPreset[] = [
  { species: "Cattle", emoji: "\uD83D\uDC04", label: "Cattle", hint: "Cows, bulls, calves", suggestedName: "Cattle herd" },
  { species: "Goats", emoji: "\uD83D\uDC10", label: "Goats", hint: "Does, bucks, kids", suggestedName: "Goat herd" },
  { species: "Sheep", emoji: "\uD83D\uDC11", label: "Sheep", hint: "Ewes, rams, lambs", suggestedName: "Sheep flock" },
  { species: "Pigs", emoji: "\uD83D\uDC16", label: "Pigs", hint: "Sows, boars, piglets", suggestedName: "Pig herd" },
  { species: "Poultry", emoji: "\uD83D\uDC14", label: "Poultry", hint: "Chickens, ducks & eggs", suggestedName: "", routeToPoultry: true },
  { species: "Other", emoji: "\uD83D\uDC3E", label: "Other", hint: "Any other animals", suggestedName: "New group" },
];

interface PresetPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with a chosen livestock preset (not the Poultry route). */
  onPick: (preset: LivestockPreset) => void;
  /** Called when the user taps the Poultry tile. */
  onGoToPoultry: () => void;
}

export default function PresetPickerDialog({
  open,
  onClose,
  onPick,
  onGoToPoultry,
}: PresetPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What are you adding?</DialogTitle>
          <DialogDescription>
            Pick the kind of animal — we&apos;ll set up the group for you so there&apos;s less to fill in.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {LIVESTOCK_PRESETS.map((preset) => (
            <button
              key={preset.species}
              type="button"
              onClick={() => {
                if (preset.routeToPoultry) {
                  onGoToPoultry();
                } else {
                  onPick(preset);
                }
              }}
              className="flex min-h-[7rem] flex-col items-center justify-center gap-1.5 rounded-xl border bg-card p-4 text-center transition-all hover:border-primary/50 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`Add ${preset.label}`}
            >
              <span className="text-4xl" aria-hidden>
                {preset.emoji}
              </span>
              <span className="text-sm font-semibold leading-tight">{preset.label}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{preset.hint}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
