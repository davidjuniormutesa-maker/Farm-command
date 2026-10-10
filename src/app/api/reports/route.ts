import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfYear(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

function daysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/**
 * GET /api/reports?from=&to=
 * One aggregate payload powering the Reports view. Every block degrades to
 * zeros / empty arrays so the report renders even on a brand-new farm.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parse = (v: string | null): Date | undefined => {
      if (!v) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const financeFrom = parse(searchParams.get("from")) ?? startOfYear();
    const financeTo = parse(searchParams.get("to")) ?? undefined;

    const today = startOfToday();
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    const yearStart = startOfYear();
    const last30 = daysAgo(30);

    const [
      speciesGroups,
      totalActive,
      groupsCount,
      recentDeaths,
      vaccinations,
      healthEvents30,
      activeCycles,
      harvestedCycles,
      fieldsCount,
      fieldsArea,
      incomeGrouped,
      expenseGrouped,
      incomeTotal,
      expenseTotal,
      completed30,
      openTasks,
      activities30,
      activeAnimalsWithWeights,
    ] = await Promise.all([
      db.animal.groupBy({ by: ["species"], where: { status: "active" }, _count: { _all: true } }),
      db.animal.count({ where: { status: "active" } }),
      db.livestockGroup.count({ where: { status: "active" } }),
      db.healthEvent.count({ where: { type: "death", date: { gte: last30 } } }),
      db.vaccination.findMany({ select: { nextDueDate: true } }),
      db.healthEvent.count({ where: { date: { gte: last30 } } }),
      db.cropCycle.findMany({
        where: { status: { in: ["planned", "growing"] } },
        include: { field: { select: { name: true } } },
        orderBy: { plantingDate: "desc" },
      }),
      db.cropCycle.findMany({
        where: { status: "harvested", actualHarvestDate: { gte: yearStart } },
        orderBy: { actualHarvestDate: "desc" },
      }),
      db.field.count(),
      db.field.aggregate({ _sum: { areaHa: true } }),
      db.financeTransaction.groupBy({
        by: ["category"],
        where: { type: "income", date: { gte: financeFrom, ...(financeTo ? { lte: financeTo } : {}) } },
        _sum: { amount: true },
      }),
      db.financeTransaction.groupBy({
        by: ["category"],
        where: { type: "expense", date: { gte: financeFrom, ...(financeTo ? { lte: financeTo } : {}) } },
        _sum: { amount: true },
      }),
      db.financeTransaction.aggregate({
        where: { type: "income", date: { gte: financeFrom, ...(financeTo ? { lte: financeTo } : {}) } },
        _sum: { amount: true },
      }),
      db.financeTransaction.aggregate({
        where: { type: "expense", date: { gte: financeFrom, ...(financeTo ? { lte: financeTo } : {}) } },
        _sum: { amount: true },
      }),
      db.task.count({ where: { status: "done", completedAt: { gte: last30 } } }),
      db.task.findMany({
        where: { status: { in: ["open", "done", "cancelled"] } },
        select: { status: true, category: true, dueDate: true },
      }),
      db.farmActivity.groupBy({
        by: ["type"],
        where: { date: { gte: last30 } },
        _count: { _all: true },
      }),
      db.animal.findMany({
        where: { status: "active" },
        select: {
          id: true,
          tagId: true,
          name: true,
          species: true,
          weightKg: true,
          targetWeightKg: true,
          weightRecords: { select: { weightKg: true, recordedAt: true }, orderBy: { recordedAt: "asc" } },
        },
      }),
    ]);

    // ---- Livestock ----
    const bySpecies = speciesGroups
      .map((g) => ({ species: g.species, count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    // ---- Health ----
    let vaccinationsDue30 = 0;
    let overdueVaccinations = 0;
    for (const v of vaccinations) {
      if (!v.nextDueDate) continue;
      const due = new Date(v.nextDueDate.getFullYear(), v.nextDueDate.getMonth(), v.nextDueDate.getDate());
      if (due < today) overdueVaccinations++;
      else if (due <= in30Days) vaccinationsDue30++;
    }

    // ---- Crops ----
    const activeCyclesOut = activeCycles.map((c) => ({
      id: c.id,
      crop: c.crop,
      variety: c.variety,
      field: c.field?.name ?? null,
      status: c.status,
      plantingDate: iso(c.plantingDate),
      expectedHarvestDate: iso(c.expectedHarvestDate),
    }));

    const harvestedThisYear = harvestedCycles
      .map((c) => ({
        crop: c.crop,
        quantity: c.harvestQuantity ?? null,
        unit: c.harvestUnit ?? null,
        saleAmount: c.saleAmount ?? null,
      }));

    // ---- Finance ----
    const toCategoryTotals = (rows: { category: string; _sum: { amount: number | null } }[]) =>
      rows
        .map((r) => ({ category: r.category, total: r._sum.amount ?? 0 }))
        .sort((a, b) => b.total - a.total);

    const income = incomeTotal._sum.amount ?? 0;
    const expense = expenseTotal._sum.amount ?? 0;

    // ---- Tasks ----
    let overdue = 0;
    let openTotal = 0;
    const openByCategory = new Map<string, number>();
    for (const t of openTasks) {
      if (t.status !== "open") continue;
      openTotal++;
      if (new Date(t.dueDate) < today) overdue++;
      openByCategory.set(t.category, (openByCategory.get(t.category) ?? 0) + 1);
    }
    const tasksByCategory = [...openByCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // ---- Activities ----
    const last30ByType = activities30
      .map((a) => ({ type: a.type, count: a._count._all }))
      .sort((a, b) => b.count - a.count);

    // ---- Weight gain (trailing 90 days, falls back to the two latest weigh-ins) ----
    const WINDOW_DAYS = 90;
    const windowStart = daysAgo(WINDOW_DAYS);
    const weightGainRows = activeAnimalsWithWeights
      .filter((a) => a.weightRecords.length >= 2)
      .map((a) => {
        const inWindow = a.weightRecords.filter((r) => r.recordedAt >= windowStart);
        const pair =
          inWindow.length >= 2
            ? [inWindow[0], inWindow[inWindow.length - 1]]
            : [a.weightRecords[a.weightRecords.length - 2], a.weightRecords[a.weightRecords.length - 1]];
        const [first, last] = pair;
        const days = Math.max(
          1,
          Math.round((last.recordedAt.getTime() - first.recordedAt.getTime()) / 86_400_000)
        );
        const gainKg = Number((last.weightKg - first.weightKg).toFixed(1));
        return {
          animalId: a.id,
          label: a.name ? `${a.tagId} · ${a.name}` : a.tagId,
          species: a.species,
          fromKg: first.weightKg,
          toKg: last.weightKg,
          currentKg: a.weightKg ?? last.weightKg,
          targetKg: a.targetWeightKg,
          fromDate: first.recordedAt.toISOString(),
          toDate: last.recordedAt.toISOString(),
          days,
          gainKg,
          adgKg: Number((gainKg / days).toFixed(3)),
          approx: inWindow.length < 2,
        };
      })
      .sort((a, b) => b.gainKg - a.gainKg);

    const gaining = weightGainRows.filter((r) => r.gainKg > 0).length;
    const losing = weightGainRows.filter((r) => r.gainKg < 0).length;
    const herdAvgAdg =
      weightGainRows.length > 0
        ? Number(
            (weightGainRows.reduce((sum, r) => sum + r.adgKg, 0) / weightGainRows.length).toFixed(3)
          )
        : 0;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      livestock: { bySpecies, totalActive, groupsCount, recentDeaths },
      health: { vaccinationsDue30, overdueVaccinations, last30Events: healthEvents30 },
      crops: {
        activeCycles: activeCyclesOut,
        harvestedThisYear,
        fieldsCount,
        totalArea: fieldsArea._sum.areaHa ?? null,
      },
      finance: {
        from: iso(financeFrom),
        to: iso(financeTo),
        income,
        expense,
        byCategoryIncome: toCategoryTotals(incomeGrouped),
        byCategoryExpense: toCategoryTotals(expenseGrouped),
      },
      tasks: { completed30, overdue, openTotal, byCategory: tasksByCategory },
      activities: { last30ByType },
      weightGain: {
        windowDays: WINDOW_DAYS,
        rows: weightGainRows,
        gaining,
        losing,
        herdAvgAdg,
      },
    });
  } catch (error) {
    console.error("GET /api/reports failed", error);
    return NextResponse.json({ error: "Failed to build report" }, { status: 500 });
  }
}
