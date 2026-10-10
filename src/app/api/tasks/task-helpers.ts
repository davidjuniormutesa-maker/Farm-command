import { z } from "zod";
import { db } from "@/lib/db";
import { PRIORITIES, REPEAT_RULES, TASK_CATEGORIES } from "@/lib/farm";
import type { TaskDTO } from "@/lib/farm";

/** Task with linked display entities (animal/group/cropCycle/field). */
export interface TaskWithLinks extends TaskDTO {
  animal?: { tagId: string; name: string | null } | null;
  group?: { name: string } | null;
  cropCycle?: { crop: string } | null;
  field?: { name: string } | null;
}

/** Serialize a Prisma Task (with optional links) into the DTO shape (ISO dates). */
export function serializeTask(t: {
  id: string;
  title: string;
  description: string | null;
  category: string;
  dueDate: Date;
  dueTime: string | null;
  priority: string;
  repeatRule: string;
  repeatIntervalDays: number | null;
  leadTimeDays: number;
  animalId: string | null;
  groupId: string | null;
  cropCycleId: string | null;
  fieldId: string | null;
  assignee: string | null;
  status: string;
  completedAt: Date | null;
  nextOccurrenceId: string | null;
  vaccinationId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  animal?: { tagId: string; name: string | null } | null;
  group?: { name: string } | null;
  cropCycle?: { crop: string } | null;
  field?: { name: string } | null;
}): TaskWithLinks {
  return {
    ...t,
    dueDate: t.dueDate.toISOString(),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

const dueTimeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Shared field schema for POST (create) and PUT (full edit). */
export function taskBodySchema() {
  return z
    .object({
      title: z.string().trim().min(1, "Title is required"),
      description: z.string().trim().optional().nullable(),
      category: z.enum(TASK_CATEGORIES),
      dueDate: z
        .string()
        .min(1, "Due date is required")
        .refine((s) => !isNaN(new Date(s).getTime()), "Due date must be a valid date"),
      dueTime: z
        .string()
        .regex(dueTimeRegex, "Due time must be HH:mm (24-hour)")
        .optional()
        .nullable(),
      priority: z.enum(PRIORITIES),
      repeatRule: z.enum(REPEAT_RULES),
      repeatIntervalDays: z.number().int().positive().optional().nullable(),
      leadTimeDays: z.number().int().min(0).default(0),
      animalId: z.string().min(1).optional().nullable(),
      groupId: z.string().min(1).optional().nullable(),
      cropCycleId: z.string().min(1).optional().nullable(),
      fieldId: z.string().min(1).optional().nullable(),
      assignee: z.string().trim().optional().nullable(),
      notes: z.string().trim().optional().nullable(),
    })
    .superRefine((val, ctx) => {
      if (val.repeatRule === "custom_days") {
        if (!val.repeatIntervalDays || val.repeatIntervalDays <= 0) {
          ctx.addIssue({
            code: "custom",
            path: ["repeatIntervalDays"],
            message: "Repeat interval (days) must be a positive whole number",
          });
        }
      }
    });
}

export type TaskBody = z.infer<ReturnType<typeof taskBodySchema>>;

/** Validate that any linked entity IDs actually exist. Returns an error message or null. */
export async function validateTaskLinks(body: TaskBody): Promise<string | null> {
  const checks: Array<[string | null | undefined, () => Promise<unknown>, string]> = [
    [body.animalId, () => db.animal.findUnique({ where: { id: body.animalId! } }), "animal"],
    [body.groupId, () => db.livestockGroup.findUnique({ where: { id: body.groupId! } }), "livestock group"],
    [body.cropCycleId, () => db.cropCycle.findUnique({ where: { id: body.cropCycleId! } }), "crop cycle"],
    [body.fieldId, () => db.field.findUnique({ where: { id: body.fieldId! } }), "field"],
  ];
  for (const [id, lookup, label] of checks) {
    if (!id) continue;
    const found = await lookup();
    if (!found) return `Linked ${label} not found (bad id)`;
  }
  return null;
}
