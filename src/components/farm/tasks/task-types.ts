import type { LucideIcon } from "lucide-react";
import { Beef, ClipboardList, Coins, HeartPulse, Sprout, Wrench } from "lucide-react";
import type { TaskDTO } from "@/lib/farm";

/** Task DTO extended with the linked display entities returned by GET /api/tasks. */
export interface TaskWithLinks extends TaskDTO {
  animal?: { tagId: string; name: string | null } | null;
  group?: { name: string } | null;
  cropCycle?: { crop: string } | null;
  field?: { name: string } | null;
}

export const TASK_CATEGORY_ICONS: Record<string, LucideIcon> = {
  general: ClipboardList,
  livestock: Beef,
  crop: Sprout,
  health: HeartPulse,
  maintenance: Wrench,
  finance: Coins,
};

/** Human label for a repeat rule — null for "once" (no badge shown). */
export function repeatRuleLabel(
  rule: string,
  intervalDays?: number | null
): string | null {
  switch (rule) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "custom_days":
      return intervalDays && intervalDays > 0 ? `Every ${intervalDays} days` : "Custom";
    default:
      return null;
  }
}
