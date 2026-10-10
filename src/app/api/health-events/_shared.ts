import { z } from "zod";
import { HEALTH_EVENT_TYPES } from "@/lib/farm";
import type { HealthEvent } from "@prisma/client";

/** Shared schema/serializer for /api/health-events routes (Task 2-a). */

export const optionalText = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v.trim() : null))
  .transform((v) => (v === "" ? null : v));

export const healthEventSchema = z.object({
  animalId: optionalText,
  groupId: optionalText,
  type: z.enum(HEALTH_EVENT_TYPES, { message: "Event type is required" }),
  title: z.string({ message: "Title is required" }).trim().min(1, "Title is required"),
  date: z
    .string({ message: "Date is required" })
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "A valid date is required" }),
  details: optionalText,
  administeredBy: optionalText,
  medication: optionalText,
  withdrawalDays: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    z.number().int("Withdrawal days must be a whole number").min(0, "Withdrawal days cannot be negative").nullable()
  ),
});

export type HealthEventWithRefs = HealthEvent & {
  animal: { tagId: string; name: string | null } | null;
  group: { name: string } | null;
};

/** Prisma health event (+animal/group refs) → JSON-safe DTO. */
export function serializeHealthEvent(e: HealthEventWithRefs) {
  return {
    id: e.id,
    animalId: e.animalId,
    groupId: e.groupId,
    type: e.type,
    title: e.title,
    date: e.date.toISOString(),
    details: e.details,
    administeredBy: e.administeredBy,
    medication: e.medication,
    withdrawalDays: e.withdrawalDays,
    animal: e.animal ? { tagId: e.animal.tagId, name: e.animal.name } : null,
    group: e.group ? { name: e.group.name } : null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
