"use client";

import { BookOpen, ExternalLink, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/farm";
import { isGeneralGuidance, topicBadgeClass, type KnowledgeArticleItem } from "./knowledge-types";

/**
 * Full-text reader for a knowledge article, with honest attribution:
 * topic, source, retrieval date, optional link — plus a "confirm locally"
 * banner whenever the content carries the general-guidance marker.
 *
 * r7-b typography pass: paragraphs are split on blank lines, the body reads
 * at a relaxed measure, and any "General guidance —" line renders as its own
 * amber note instead of a plain paragraph.
 */
export function ArticleDetailDialog({
  article,
  open,
  onOpenChange,
}: {
  article: KnowledgeArticleItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open && article !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {article && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={topicBadgeClass(article.topic)}>
                  {article.topic}
                </Badge>
                {article.userAdded && (
                  <Badge variant="outline" className="border-dashed">
                    My note
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-left text-xl leading-snug">{article.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left text-xs">
                <span className="text-muted-foreground">Source:</span>
                {article.sourceUrl ? (
                  <a
                    href={article.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-gold underline-offset-4 hover:decoration-2"
                  >
                    {article.source}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : (
                  <span className="font-medium text-foreground">{article.source}</span>
                )}
                <span className="text-muted-foreground" aria-hidden>
                  ·
                </span>
                {article.publishedDate && (
                  <>
                    <span className="text-muted-foreground">
                      published {formatDate(article.publishedDate)}
                    </span>
                    <span className="text-muted-foreground" aria-hidden>
                      ·
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">
                  retrieved {formatDate(article.retrievedDate)}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="farm-scroll max-h-[55vh] space-y-4 overflow-y-auto pr-1">
              {isGeneralGuidance(article) && (
                <div
                  className="flex items-start gap-2.5 rounded-lg border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  role="note"
                >
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">General guidance.</span> Always confirm with your
                    local extension officer or veterinarian before acting.
                  </span>
                </div>
              )}

              <div className="max-w-prose text-[15px] leading-relaxed text-foreground/90 sm:text-base">
                {article.content
                  .split(/\n\n+/)
                  .filter((block) => block.trim() !== "")
                  .map((block, i) =>
                    block.startsWith("General guidance —") ? (
                      <div
                        key={i}
                        role="note"
                        className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 last:mb-0 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                      >
                        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>{block}</span>
                      </div>
                    ) : (
                      <p key={i} className="mb-3 whitespace-pre-line last:mb-0">
                        {block}
                      </p>
                    ),
                  )}
              </div>

              {article.sourceUrl && (
                <a
                  href={article.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  Visit source website
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>

            <p className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
              <BookOpen className="size-3.5 shrink-0" aria-hidden />
              Saved on this device — readable offline.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
