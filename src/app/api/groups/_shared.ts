import { z } from "zod";
import { SPECIES } from "@/lib/farm";
import type { LivestockGroup } from "@prisma/client";

/** Shared schema/serializer for /api/groups routes (Task 2-a). */

export const optionalText = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v.trim() : null))
  .transform((v) => (v === "" ? null : v));

/** Non-negative whole-number count, defaults to 0 when blank. */
const countField = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
  z.number().int("Count must be a whole number").min(0, "Count cannot be negative")
);

export const groupSchema = z.object({
  name: z.string({ message: "Group name is required" }).trim().min(1, "Group name is required"),
  species: z.enum(SPECIES, { message: "Species is required" }),
  breed: optionalText,
  // Head count: whole number, 0 allowed (e.g. a flock that has been sold off but kept for records).
  count: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number().int("Count must be a whole number").min(0, "Count cannot be negative")
  ),
  // Optional simple role breakdown (patriarchs / matriarchs / young / castrated).
  breedingMaleCount: countField,
  breedingFemaleCount: countField,
  youngCount: countField,
  castratedCount: countField,
  location: optionalText,
  acquisition: optionalText,
  status: z.enum(["active", "archived"]).optional(),
  notes: optionalText,
});

/** Prisma group → JSON-safe DTO (all dates as ISO strings). */
export function serializeGroup(g: LivestockGroup) {
  return {
    id: g.id,
    name: g.name,
    species: g.species,
    breed: g.breed,
    count: g.count,
    breedingMaleCount: g.breedingMaleCount,
    breedingFemaleCount: g.breedingFemaleCount,
    youngCount: g.youngCount,
    castratedCount: g.castratedCount,
    location: g.location,
    acquisition: g.acquisition,
    status: g.status,
    notes: g.notes,
    photo: g.photo,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}
