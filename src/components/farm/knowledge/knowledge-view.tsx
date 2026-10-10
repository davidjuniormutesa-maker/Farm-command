"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, CloudOff, ExternalLink, Info, Landmark, Loader2, NotebookPen, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiGet, apiSend, qk } from "@/lib/api";
import { formatDate } from "@/lib/farm";
import { useFarmStore } from "@/components/farm/store";
import { NoteFormDialog } from "./note-form-dialog";
import { ArticleDetailDialog } from "./article-detail-dialog";
import {
  TOPIC_FILTERS,
  topicBadgeClass,
  type KnowledgeArticleItem,
  type KnowledgeTopicFilter,
} from "./knowledge-types";

/**
 * Official Zambian institutions for further reading (r8-b). These are links
 * OUT, not bundled content — they are only reachable while online, and Farm
 * Command is not affiliated with the institutions.
 */
const EXTERNAL_SOURCES = [
  { label: "Ministry of Agriculture", href: "https://www.agriculture.gov.zm" },
  { label: "Ministry of Fisheries and Livestock", href: "https://www.mfl.gov.zm" },
  { label: "Zambia Agriculture Research Institute (ZARI)", href: "https://zari.gov.zm" },
  { label: "Zambia National Farmers Union", href: "https://www.znfu.co.zm" },
] as const;

/**
 * Knowledge Hub — Zambia-first agricultural reference articles plus the
 * farmer's own saved notes. Data is fetched through TanStack Query, so the
 * last successful response stays readable from cache while offline.
 */
export default function KnowledgeView() {
  const queryClient = useQueryClient();
  const [topicFilter, setTopicFilter] = useState<KnowledgeTopicFilter>("all");
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState<KnowledgeArticleItem | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeArticleItem | null>(null);

  const { data: articles, isLoading, isError, error } = useQuery({
    queryKey: qk.knowledge,
    queryFn: () => apiGet<KnowledgeArticleItem[]>("/api/knowledge"),
    staleTime: 5 * 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiSend<{ ok: boolean }>(`/api/knowledge/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.knowledge });
      toast.success("Article deleted.");
    },
    onError: (err: Error) => toast.error(err.message || "The article could not be deleted."),
    onSettled: () => setDeleteTarget(null),
  });

  const filtered = useMemo(() => {
    if (!articles) return [];
    const q = search.trim().toLowerCase();
    return articles.filter((a) => {
      if (topicFilter === "notes" && !a.userAdded) return false;
      if (topicFilter !== "all" && topicFilter !== "notes" && a.topic !== topicFilter) return false;
      if (!q) return true;
      return [a.title, a.summary, a.content, a.source].some((f) => f.toLowerCase().includes(q));
    });
  }, [articles, topicFilter, search]);

  const hasFilter = topicFilter !== "all" || search.trim() !== "";

  return (
    <div className="space-y-5">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <BookOpen className="size-5 text-primary" aria-hidden />
            Knowledge Hub
          </h2>
          <p className="text-sm text-muted-foreground">
            Zambia-first farming reference · saved on device
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => useFarmStore.getState().setAssistantOpen(true)}>
            <Sparkles className="size-4 text-primary" aria-hidden />
            Ask the Assistant
          </Button>
          <Button className="min-h-11" onClick={() => setNoteOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Save a note
          </Button>
        </div>
      </div>

      {/* ---------- Offline note ---------- */}
      <div
        className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground"
        role="note"
      >
        <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Saved articles remain readable offline — everything here is stored on this device.</span>
      </div>

      {/* ---------- Filters ---------- */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          className="farm-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="Filter by topic"
        >
          {TOPIC_FILTERS.map((t) => {
            const active = topicFilter === t.key;
            return (
              <Button
                key={t.key}
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                className="min-h-9 shrink-0 rounded-full px-4"
                onClick={() => setTopicFilter(t.key)}
              >
                {t.label}
              </Button>
            );
          })}
        </div>
        <div className="relative lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles…"
            aria-label="Search articles"
            className="min-h-11 pl-9"
          />
        </div>
      </div>

      {/* ---------- Articles ---------- */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="mb-3 h-5 w-20 rounded-full" />
              <Skeleton className="mb-2 h-5 w-3/4" />
              <Skeleton className="mb-1 h-4 w-full" />
              <Skeleton className="mb-1 h-4 w-full" />
              <Skeleton className="mb-4 h-4 w-2/3" />
              <Skeleton className="h-11 w-full" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10" aria-hidden>
            <Info className="size-7 text-destructive" />
          </div>
          <h3 className="text-base font-semibold">Articles could not be loaded</h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {(error as Error)?.message || "Something went wrong while loading the Knowledge Hub."}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10" aria-hidden>
            <BookOpen className="size-7 text-primary" />
          </div>
          <h3 className="text-base font-semibold">
            {hasFilter ? "No articles match" : "No articles yet"}
          </h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            {hasFilter
              ? "Try a different topic or clear the search — or save your own note on this subject."
              : "Open the Knowledge Hub once while online and the reference articles will be saved to this device."}
          </p>
          {hasFilter ? (
            <Button
              variant="outline"
              className="mt-1 min-h-11"
              onClick={() => {
                setTopicFilter("all");
                setSearch("");
              }}
            >
              Clear filters
            </Button>
          ) : (
            <Button className="mt-1 min-h-11" onClick={() => setNoteOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Save a note
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => (
            <Card key={a.id} className="flex flex-col gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
              <CardContent className="flex flex-1 flex-col gap-3 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={topicBadgeClass(a.topic)}>
                    {a.topic}
                  </Badge>
                  {a.userAdded && (
                    <Badge variant="outline" className="gap-1 border-dashed">
                      <NotebookPen className="size-3" aria-hidden />
                      My note
                    </Badge>
                  )}
                </div>
                <h3 className="text-base font-semibold leading-snug">{a.title}</h3>
                <p className="line-clamp-3 text-sm text-muted-foreground">{a.summary}</p>
                <p className="mt-auto text-xs text-muted-foreground">
                  Source: {a.source} · retrieved {formatDate(a.retrievedDate)}
                </p>
              </CardContent>
              <CardFooter className="flex gap-2 border-t bg-muted/20 p-3">
                <Button variant="outline" className="min-h-11 flex-1" onClick={() => setReading(a)}>
                  Read
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete "${a.title}"`}
                  onClick={() => setDeleteTarget(a)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* ---------- Sourcing disclaimer ---------- */}
      <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
        Reference content only. Farm Command does not replace professional advice — always confirm
        with your local extension officer or veterinarian.
      </p>

      {/* ---------- More Zambian sources (r8-b) ---------- */}
      <Card className="bg-muted/30">
        <CardContent className="p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Landmark className="size-4 text-primary" aria-hidden />
            More Zambian sources
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Browse these institutions online for official Zambian farming guidance:
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {EXTERNAL_SOURCES.map((s) => (
              <li key={s.href}>
                <Button variant="outline" size="sm" className="min-h-9 rounded-full px-4" asChild>
                  <a href={s.href} target="_blank" rel="noopener noreferrer">
                    {s.label}
                    <ExternalLink className="size-3.5 opacity-60" aria-hidden />
                  </a>
                </Button>
              </li>
            ))}
          </ul>
          <p
            className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
            role="note"
          >
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              These links open external websites. Farm Command is not affiliated with them, and
              their pages are only available while you are online.
            </span>
          </p>
        </CardContent>
      </Card>

      {/* ---------- Dialogs ---------- */}
      <ArticleDetailDialog article={reading} open={reading !== null} onOpenChange={(next) => !next && setReading(null)} />
      <NoteFormDialog open={noteOpen} onOpenChange={setNoteOpen} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this article?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.userAdded
                ? "This note is stored only on this device. Deleting it cannot be undone."
                : `"${deleteTarget?.title}" is reference content. You can bring the reference set back later by resetting farm data (Settings → Data) — your own notes will be removed too, so export a backup first if needed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
