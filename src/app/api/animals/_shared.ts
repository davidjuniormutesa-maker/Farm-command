import { z } from "zod";
import { SPECIES } from "@/lib/farm";
import type { Animal } from "@prisma/client";

/** Shared schema/serializer for /api/animals routes (Task 2-a). */

/** Optional free text: "" | undefined | null → null */
export const optionalText = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v.trim() : null))
  .transform((v) => (v === "" ? null : v));

/** ISO date string or null. Empty string is treated as null. */
export const isoDateOrNull = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { message: "Invalid date" });

/** Number or null. "" / undefined → null. */
export const positiveNumberOrNull = (label: string) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    z.number().positive(`${label} must be greater than 0`).nullable()
  );

export const animalSchema = z.object({
  tagId: z.string({ message: "Tag ID is required" }).trim().min(1, "Tag ID is required"),
  species: z.enum(SPECIES, { message: "Species is required" }),
  name: optionalText,
  breed: optionalText,
  sex: z
    .enum(["female", "male", "unknown"])
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  birthDate: isoDateOrNull,
  estimatedAge: optionalText,
  acquisition: optionalText,
  acquisitionDate: isoDateOrNull,
  location: optionalText,
  status: z.enum(["active", "sold", "deceased", "archived"]).default("active"),
  weightKg: positiveNumberOrNull("Weight"),
  targetWeightKg: positiveNumberOrNull("Target weight"),
  notes: optionalText,
  groupId: optionalText,
});

export type AnimalWithGroupName = Animal & { group: { name: string } | null };

/** Prisma animal (+group name) → JSON-safe DTO (all dates as ISO strings). */
export function serializeAnimal(a: AnimalWithGroupName) {
  return {
    id: a.id,
    tagId: a.tagId,
    name: a.name,
    species: a.species,
    breed: a.breed,
    sex: a.sex,
    birthDate: a.birthDate ? a.birthDate.toISOString() : null,
    estimatedAge: a.estimatedAge,
    acquisition: a.acquisition,
    acquisitionDate: a.acquisitionDate ? a.acquisitionDate.toISOString() : null,
    location: a.location,
    status: a.status,
    weightKg: a.weightKg,
    targetWeightKg: a.targetWeightKg,
    notes: a.notes,
    photo: a.photo,
    groupId: a.groupId,
    group: a.group ? { name: a.group.name } : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
