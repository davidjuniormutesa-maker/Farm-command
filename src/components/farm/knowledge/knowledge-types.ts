"use client";

import type { KnowledgeArticleDTO } from "@/lib/farm";
import type { LucideIcon } from "lucide-react";
import { Sprout, Milk, Droplets, CloudSun, Coins } from "lucide-react";

/** Knowledge article as returned by GET /api/knowledge (adds the userAdded flag). */
export type KnowledgeArticleItem = KnowledgeArticleDTO & { userAdded: boolean };

export const KNOWLEDGE_TOPICS = ["Crops", "Livestock", "Water", "Climate", "Business"] as const;
export type KnowledgeTopicFilter = "all" | "notes" | (typeof KNOWLEDGE_TOPICS)[number];

export const TOPIC_FILTERS: { key: KnowledgeTopicFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Crops", label: "Crops" },
  { key: "Livestock", label: "Livestock" },
  { key: "Water", label: "Water" },
  { key: "Climate", label: "Climate" },
  { key: "Business", label: "Business" },
  { key: "notes", label: "My notes" },
];

/** Marker line appended to every curated article's content. */
export const GENERAL_GUIDANCE_LINE = "General guidance — confirm with your local agricultural extension officer.";

export function isGeneralGuidance(a: Pick<KnowledgeArticleDTO, "content">): boolean {
  return a.content.includes("General guidance — confirm with your local");
}

/** Topic badge palette — greens/golds/teals only, no indigo or blue. */
export function topicBadgeClass(topic: string): string {
  switch (topic) {
    case "Crops":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
    case "Livestock":
      return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900";
    case "Water":
      return "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900";
    case "Climate":
      return "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800/60 dark:text-stone-300 dark:border-stone-700";
    case "Business":
      return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export const TOPIC_ICONS: Record<string, LucideIcon> = {
  Crops: Sprout,
  Livestock: Milk,
  Water: Droplets,
  Climate: CloudSun,
  Business: Coins,
};
