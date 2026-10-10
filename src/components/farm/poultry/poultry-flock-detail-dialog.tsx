"use client";

/**
 * PoultryFlockDetailDialog — flock profile + daily egg collection log.
 * Reads the flock (with its egg logs + totals) from /api/poultry/{id}, lets you
 * log a day's eggs, delete a log entry, edit the flock, or delete the flock.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Egg, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { apiGet, apiSend, qk } from "@/lib/api";
import { formatDate, flockRoleSummary, BIRD_TYPE_EMOJI } from "@/lib/farm";
import type { PoultryFlockDTO, PoultryFlockWithEggsDTO } from "@/lib/farm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface PoultryFlockDetailDialogProps {
  flockId: string;
  onClose: () => void;
  onEdit: (flock: PoultryFlockDTO) => void;
}

/** Today in YYYY-MM-DD for the date input default. */
function todayInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export default function PoultryFlockDetailDialog({ flockId, onClose, onEdit }: PoultryFlockDetailDialogProps) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [savingEggs, setSavingEggs] = useState(false);
  const [eggDate, setEggDate] = useState<string>(todayInput());
  const [eggCount, setEggCount] = useState<string>("");
  const [eggNotes, setEggNotes] = useState<string>("");

  const { data: flock, isLoading } = useQuery({
    queryKey: [...qk.poultry, flockId],
    queryFn: () => apiGet<PoultryFlockWithEggsDTO>(`/api/poultry/${flockId}`),
  });

  const invalidateAll = () => {
    for (const key of [qk.poultry, qk.eggs, [...qk.poultry, flockId], qk.summary, qk.dashboard]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const remove = async () => {
    if (!flock) return;
    setDeleting(true);
    try {
      await apiSend(`/api/poultry/${flock.id}`, "DELETE");
      toast.success(`Flock "${flock.name}" deleted`, {
        description: "Its egg logs were removed too.",
      });
      invalidateAll();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the flock");
    } finally {
      setDeleting(false);
    }
  };

  const logEggs = async () => {
    if (!flock) return;
    const eggs = Number(eggCount);
    if (eggCount.trim() === "" || !Number.isInteger(eggs) || eggs < 0) {
      toast.error("Enter how many eggs (a whole number, 0 or more).");
      return;
    }
    setSavingEggs(true);
    try {
      await apiSend(`/api/poultry/${flock.id}/eggs`, "POST", {
        date: new Date(`${eggDate}T00:00:00`).toISOString(),
        eggs,
        notes: eggNotes.trim() || null,
      });
      toast.success(`Logged ${eggs} egg${eggs === 1 ? "" : "s"}`);
      setEggCount("");
      setEggNotes("");
      invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not log the eggs");
    } finally {
      setSavingEggs(false);
    }
  };

  const deleteEgg = async (logId: string) => {
    if (!flock) return;
    try {
      await apiSend(`/api/poultry/${flock.id}/eggs/${logId}`, "DELETE");
      toast.success("Egg log removed");
      invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove that entry");
    }
  };

  const roleSummary = flock ? flockRoleSummary(flock) : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="farm-scroll max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          {isLoading || !flock ? (
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-xl" />
              <div className="space-y-2">
                <DialogTitle className="sr-only">Loading flock…</DialogTitle>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-muted/40 text-2xl" aria-hidden>
                  {flock.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={flock.photo} alt="" className="size-12 rounded-xl object-cover" />
                  ) : (
                    BIRD_TYPE_EMOJI[flock.birdType] ?? "\uD83D\uDC26"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate">{flock.name}</DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{flock.birdType}</Badge>
                    {flock.breed && <span className="text-muted-foreground">{flock.breed}</span>}
                    <span className="text-muted-foreground">· {flock.count} bird{flock.count === 1 ? "" : "s"}</span>
                  </DialogDescription>
                </div>
              </div>
            </>
          )}
        </DialogHeader>

        {flock && (
          <div className="space-y-5">
            {/* Flock facts */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Eggs today</p>
                <p className="text-lg font-semibold">{flock.eggsToday}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Last 7 days</p>
                <p className="text-lg font-semibold">{flock.eggsLast7Days}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">All-time eggs</p>
                <p className="text-lg font-semibold">{flock.eggsTotal}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="truncate text-sm font-medium">{flock.location || "—"}</p>
              </div>
            </div>

            {roleSummary && <p className="text-sm text-muted-foreground">{roleSummary}</p>}
            {flock.feedNote && (
              <p className="text-sm">
                <span className="text-muted-foreground">Feed:</span> {flock.feedNote}
              </p>
            )}
            {flock.notes && <p className="text-sm whitespace-pre-wrap">{flock.notes}</p>}

            {/* Log eggs */}
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Egg className="size-4" aria-hidden />
                <p className="text-sm font-medium">Log egg collection</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="egg-date" className="text-xs">Date</Label>
                  <Input id="egg-date" type="date" value={eggDate} onChange={(e) => setEggDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="egg-count" className="text-xs">Eggs collected</Label>
                  <Input
                    id="egg-count"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={eggCount}
                    onChange={(e) => setEggCount(e.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="egg-notes" className="text-xs">Note (optional)</Label>
                  <Input id="egg-notes" value={eggNotes} onChange={(e) => setEggNotes(e.target.value)} placeholder="e.g. 1 cracked" />
                </div>
              </div>
              <Button type="button" className="min-h-11" onClick={logEggs} disabled={savingEggs}>
                {savingEggs ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                Log eggs
              </Button>
            </div>

            {/* Egg history */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Recent egg logs</p>
              {flock.eggLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No eggs logged yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {flock.eggLogs.slice(0, 30).map((log) => (
                    <li key={log.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {log.eggs} egg{log.eggs === 1 ? "" : "s"}
                          <span className="ml-2 font-normal text-muted-foreground">{formatDate(log.date)}</span>
                        </p>
                        {log.notes && <p className="truncate text-xs text-muted-foreground">{log.notes}</p>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label="Delete this egg log"
                        onClick={() => deleteEgg(log.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => onEdit(flock)}>
                <Pencil className="size-4" aria-hidden />
                Edit flock
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" className="min-h-11 text-destructive" disabled={deleting}>
                    {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                    Delete flock
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{flock.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the flock and all its egg logs from your records. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
