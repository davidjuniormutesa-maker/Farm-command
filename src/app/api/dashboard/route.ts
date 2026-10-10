import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeTaskStatus, daysUntil, formatKwacha, startOfToday, type TaskDTO } from "@/lib/farm";

export const dynamic = "force-dynamic";

function toTaskDTO(t: {
  id: string; title: string; description: string | null; category: string; dueDate: Date; dueTime: string | null;
  priority: string; repeatRule: string; repeatIntervalDays: number | null; leadTimeDays: number;
  animalId: string | null; groupId: string | null; cropCycleId: string | null; fieldId: string | null;
  assignee: string | null; status: string; completedAt: Date | null; nextOccurrenceId: string | null;
  vaccinationId: string | null; notes: string | null; createdAt: Date; updatedAt: Date;
}): TaskDTO {
  return {
    ...t,
    dueDate: t.dueDate.toISOString(),
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** One call for everything the dashboard needs. */
export async function GET() {
  try {
    const today = startOfToday();
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [openTasks, vaccinations, activeCrops, animalCount, groupCount, fieldCount,
      activities, monthIncomeAgg, monthExpenseAgg, incomeByCat] = await Promise.all([
      db.task.findMany({
        where: { status: "open", deletedAt: null },
        orderBy: { dueDate: "asc" },
        include: { animal: { select: { tagId: true, name: true } }, field: { select: { name: true } }, cropCycle: { select: { crop: true } }, group: { select: { name: true } } },
        take: 100,
      }),
      db.vaccination.findMany({
        where: { deletedAt: null },
        orderBy: { nextDueDate: "asc" },
        include: { animal: { select: { tagId: true, name: true } }, group: { select: { name: true } } },
      }),
      db.cropCycle.findMany({
        where: { status: { in: ["planned", "growing"] }, deletedAt: null },
        include: { field: { select: { name: true } } },
        orderBy: { plantingDate: "desc" },
      }),
      db.animal.count({ where: { status: "active", deletedAt: null } }),
      db.livestockGroup.count({ where: { status: "active", deletedAt: null } }),
      db.field.count({ where: { deletedAt: null } }),
      db.farmActivity.findMany({
        where: { deletedAt: null },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 6,
        include: { animal: { select: { tagId: true } }, field: { select: { name: true } }, cropCycle: { select: { crop: true } }, group: { select: { name: true } } },
      }),
      db.financeTransaction.aggregate({ _sum: { amount: true }, where: { type: "income", date: { gte: monthStart }, deletedAt: null } }),
      db.financeTransaction.aggregate({ _sum: { amount: true }, where: { type: "expense", date: { gte: monthStart }, deletedAt: null } }),
      db.financeTransaction.groupBy({ by: ["category"], _sum: { amount: true }, where: { type: "expense", date: { gte: monthStart }, deletedAt: null } }),
    ]);

    // Split tasks by status
    const overdue: TaskDTO[] = [];
    const dueToday: TaskDTO[] = [];
    const upcoming: TaskDTO[] = [];
    for (const t of openTasks) {
      const dto = toTaskDTO(t);
      const s = computeTaskStatus(dto);
      if (s === "overdue") overdue.push(dto);
      else if (s === "due_today") dueToday.push(dto);
      else upcoming.push(dto);
    }

    // Vaccination reminders (next-due based)
    const upcomingVaccinations = vaccinations
      .filter((v) => v.nextDueDate)
      .map((v) => ({
        id: v.id,
        vaccineName: v.vaccineName,
        target: v.animal ? (v.animal.name ? `${v.animal.tagId} — ${v.animal.name}` : v.animal.tagId) : (v.group?.name ?? "Group"),
        nextDueDate: v.nextDueDate!.toISOString(),
        days: daysUntil(v.nextDueDate!.toISOString()) ?? 0,
      }))
      .sort((a, b) => a.days - b.days);
    const overdueVaccinations = upcomingVaccinations.filter((v) => v.days < 0);
    const soonVaccinations = upcomingVaccinations.filter((v) => v.days >= 0 && v.days <= 30);

    // Growing crops nearing expected harvest (14 days)
    const nearingHarvest = activeCrops
      .filter((c) => c.expectedHarvestDate)
      .map((c) => ({
        id: c.id,
        crop: c.crop,
        field: c.field?.name ?? null,
        expectedHarvestDate: c.expectedHarvestDate!.toISOString(),
        days: daysUntil(c.expectedHarvestDate!.toISOString()) ?? 0,
      }))
      .filter((c) => c.days <= 14)
      .sort((a, b) => a.days - b.days);

    const monthIncome = monthIncomeAgg._sum.amount ?? 0;
    const monthExpense = monthExpenseAgg._sum.amount ?? 0;

    return NextResponse.json({
      attention: {
        overdueTasks: overdue.length,
        dueTodayTasks: dueToday.length,
        overdueVaccinations: overdueVaccinations.length,
        nearingHarvest: nearingHarvest.length,
      },
      glance: {
        livestockTotal: animalCount,
        groupTotal: groupCount,
        activeCrops: activeCrops.length,
        fieldsTotal: fieldCount,
        openTasks: openTasks.length,
      },
      tasks: {
        overdue: overdue.slice(0, 5),
        overdueCount: overdue.length,
        dueToday: dueToday.slice(0, 5),
        dueTodayCount: dueToday.length,
        upcoming: upcoming.slice(0, 5),
      },
      vaccinations: {
        overdue: overdueVaccinations.slice(0, 3),
        soon: soonVaccinations.slice(0, 5),
      },
      crops: {
        active: activeCrops.slice(0, 4).map((c) => ({
          id: c.id,
          crop: c.crop,
          variety: c.variety,
          field: c.field?.name ?? null,
          status: c.status,
          expectedHarvestDate: c.expectedHarvestDate?.toISOString() ?? null,
        })),
        nearingHarvest: nearingHarvest.slice(0, 3),
      },
      finances: {
        monthIncome,
        monthExpense,
        monthNet: monthIncome - monthExpense,
        topExpenseCategories: incomeByCat
          .map((c) => ({ category: c.category, total: c._sum.amount ?? 0 }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 4)
          .map((c) => ({ ...c, label: formatKwacha(c.total) })),
      },
      recentActivities: activities.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        date: a.date.toISOString(),
        details: a.details,
        linkLabel: a.animal?.tagId ?? a.field?.name ?? a.cropCycle?.crop ?? a.group?.name ?? null,
      })),
      todayISO: today.toISOString(),
    });
  } catch (error) {
    console.error("GET /api/dashboard failed", error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
