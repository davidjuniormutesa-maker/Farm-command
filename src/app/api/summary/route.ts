import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeTaskStatus } from "@/lib/farm";

export const dynamic = "force-dynamic";

/** Lightweight counts used by the shell badges + dashboard "farm at a glance". */
export async function GET() {
  try {
    const [animals, groups, activeCrops, fields, openTasks, vaccinations, monthStart] =
      await Promise.all([
        db.animal.count({ where: { status: "active", deletedAt: null } }),
        db.livestockGroup.count({ where: { status: "active", deletedAt: null } }),
        db.cropCycle.count({ where: { status: { in: ["planned", "growing"] }, deletedAt: null } }),
        db.field.count({ where: { deletedAt: null } }),
        db.task.findMany({ where: { status: "open", deletedAt: null } }),
        db.vaccination.findMany({ where: { deletedAt: null } }),
        Promise.resolve(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
      ]);

    let overdueTasks = 0;
    let dueTodayTasks = 0;
    for (const t of openTasks) {
      const s = computeTaskStatus({
        ...t,
        dueDate: t.dueDate.toISOString(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
      });
      if (s === "overdue") overdueTasks++;
      else if (s === "due_today") dueTodayTasks++;
    }

    const now = new Date();
    let upcomingVaccinations = 0;
    let overdueVaccinations = 0;
    for (const v of vaccinations) {
      if (!v.nextDueDate) continue;
      const days = Math.round(
        (new Date(v.nextDueDate.getFullYear(), v.nextDueDate.getMonth(), v.nextDueDate.getDate()).getTime() -
          new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
          86_400_000
      );
      if (days < 0) overdueVaccinations++;
      else if (days <= 30) upcomingVaccinations++;
    }

    const [incomeRows, expenseRows] = await Promise.all([
      db.financeTransaction.findMany({ where: { type: "income", date: { gte: monthStart }, deletedAt: null }, select: { amount: true } }),
      db.financeTransaction.findMany({ where: { type: "expense", date: { gte: monthStart }, deletedAt: null }, select: { amount: true } }),
    ]);

    return NextResponse.json({
      livestockTotal: animals,
      groupTotal: groups,
      activeCrops,
      fieldsTotal: fields,
      openTasks: openTasks.length,
      overdueTasks,
      dueTodayTasks,
      upcomingVaccinations,
      overdueVaccinations,
      monthIncome: incomeRows.reduce((s, r) => s + r.amount, 0),
      monthExpense: expenseRows.reduce((s, r) => s + r.amount, 0),
    });
  } catch (error) {
    console.error("GET /api/summary failed", error);
    return NextResponse.json({ error: "Failed to compute summary" }, { status: 500 });
  }
}
