import { z } from "zod";
import { db } from "@/lib/db";
import { parseSettings } from "@/lib/settings-schema";
import type { Vaccination } from "@prisma/client";

/** Shared schema/serializer/reminder-engine for /api/vaccinations routes (Task 2-a). */

export const optionalText = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v.trim() : null))
  .transform((v) => (v === "" ? null : v));

export const isoDateOrNull = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { message: "Invalid date" });

export const vaccinationSchema = z.object({
  animalId: optionalText,
  groupId: optionalText,
  vaccineName: z.string({ message: "Vaccine name is required" }).trim().min(1, "Vaccine name is required"),
  dateGiven: z
    .string({ message: "Date given is required" })
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "A valid date given is required" }),
  nextDueDate: isoDateOrNull,
  batchNumber: optionalText,
  administeredBy: optionalText,
  notes: optionalText,
});

export type VaccinationWithRefs = Vaccination & {
  animal: { tagId: string; name: string | null } | null;
  group: { name: string } | null;
};

/** Prisma vaccination (+animal/group refs) → JSON-safe DTO. */
export function serializeVaccination(v: VaccinationWithRefs) {
  return {
    id: v.id,
    animalId: v.animalId,
    groupId: v.groupId,
    vaccineName: v.vaccineName,
    dateGiven: v.dateGiven.toISOString(),
    nextDueDate: v.nextDueDate ? v.nextDueDate.toISOString() : null,
    batchNumber: v.batchNumber,
    administeredBy: v.administeredBy,
    notes: v.notes,
    attachment: v.attachment,
    reminderTaskId: v.reminderTaskId,
    animal: v.animal ? { tagId: v.animal.tagId, name: v.animal.name } : null,
    group: v.group ? { name: v.group.name } : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

/** Read reminderLeadDays from farm settings (fallback: 3). */
export async function getReminderLeadDays(): Promise<number> {
  try {
    const rows = await db.farmSetting.findMany({ select: { key: true, value: true } });
    const settings = parseSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
    return Number.isFinite(settings.reminderLeadDays) && settings.reminderLeadDays >= 0
      ? settings.reminderLeadDays
      : 3;
  } catch (error) {
    console.error("Could not read reminderLeadDays from settings — using default 3", error);
    return 3;
  }
}

/** "C-023 Mama" | "C-031" | "Main Cattle Herd" */
export function targetLabel(animal?: { tagId: string; name: string | null } | null, group?: { name: string } | null): string {
  if (animal) return animal.name ? `${animal.tagId} ${animal.name}` : animal.tagId;
  if (group) return group.name;
  return "farm";
}

/**
 * Vaccination reminder contract:
 * nextDueDate set  → create/update the linked open Task (matched by vaccinationId):
 *   {title: "<vaccine> due — <tag/name>", description: "Vaccination next-due reminder generated
 *   automatically.", category: "health", dueDate: nextDueDate, priority: "high" when overdue else
 *   "medium", repeatRule: "once", animalId?, groupId?, vaccinationId, leadTimeDays: settings.reminderLeadDays}
 * nextDueDate null → delete the linked open task.
 * Returns the reminder task id (or null).
 */
export async function syncVaccinationReminder(vaccination: {
  id: string;
  vaccineName: string;
  nextDueDate: Date | null;
  animalId: string | null;
  groupId: string | null;
}): Promise<string | null> {
  const existing = await db.task.findFirst({
    where: { vaccinationId: vaccination.id, status: "open" },
    select: { id: true },
  });

  if (!vaccination.nextDueDate) {
    if (existing) await db.task.delete({ where: { id: existing.id } });
    return null;
  }

  const [animal, group, leadTimeDays] = await Promise.all([
    vaccination.animalId
      ? db.animal.findUnique({ where: { id: vaccination.animalId }, select: { tagId: true, name: true } })
      : Promise.resolve(null),
    vaccination.groupId
      ? db.livestockGroup.findUnique({ where: { id: vaccination.groupId }, select: { name: true } })
      : Promise.resolve(null),
    getReminderLeadDays(),
  ]);

  const taskData = {
    title: `${vaccination.vaccineName} due — ${targetLabel(animal, group)}`,
    description: "Vaccination next-due reminder generated automatically.",
    category: "health",
    dueDate: vaccination.nextDueDate,
    priority: vaccination.nextDueDate.getTime() < Date.now() ? "high" : "medium",
    repeatRule: "once",
    animalId: vaccination.animalId,
    groupId: vaccination.groupId,
    vaccinationId: vaccination.id,
    leadTimeDays,
  };

  if (existing) {
    const task = await db.task.update({ where: { id: existing.id }, data: taskData, select: { id: true } });
    return task.id;
  }
  const task = await db.task.create({ data: taskData, select: { id: true } });
  return task.id;
}

const vaccinationInclude = {
  animal: { select: { tagId: true, name: true } },
  group: { select: { name: true } },
} as const;

/** Create a vaccination then create/sync its reminder task and store reminderTaskId. */
export async function createVaccinationWithReminder(data: {
  animalId: string | null;
  groupId: string | null;
  vaccineName: string;
  dateGiven: Date;
  nextDueDate: Date | null;
  batchNumber: string | null;
  administeredBy: string | null;
  notes: string | null;
}) {
  const created = await db.vaccination.create({ data, include: vaccinationInclude });
  const reminderTaskId = await syncVaccinationReminder(created);
  return db.vaccination.update({
    where: { id: created.id },
    data: { reminderTaskId },
    include: vaccinationInclude,
  });
}

/** Update a vaccination, then re-sync its reminder task and store reminderTaskId. */
export async function updateVaccinationWithReminder(
  id: string,
  data: {
    animalId: string | null;
    groupId: string | null;
    vaccineName: string;
    dateGiven: Date;
    nextDueDate: Date | null;
    batchNumber: string | null;
    administeredBy: string | null;
    notes: string | null;
  }
) {
  await db.vaccination.update({ where: { id }, data });
  const vaccination = await db.vaccination.findUnique({ where: { id }, include: vaccinationInclude });
  if (!vaccination) return null;
  const reminderTaskId = await syncVaccinationReminder(vaccination);
  return db.vaccination.update({
    where: { id },
    data: { reminderTaskId },
    include: vaccinationInclude,
  });
}
