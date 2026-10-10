import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export interface CategoryTotal {
  category: string;
  total: number;
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * GET /api/finance/summary?from=&to=
 * Aggregated recorded income / expenses for a period (defaults to all time).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = parseDate(searchParams.get("from"));
    const to = parseDate(searchParams.get("to"));

    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = from;
    if (to) dateFilter.lte = to;
    const where = Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {};

    const [incomeGrouped, expenseGrouped, incomeTotal, expenseTotal, count] = await Promise.all([
      db.financeTransaction.groupBy({
        by: ["category"],
        where: { ...where, type: "income" },
        _sum: { amount: true },
      }),
      db.financeTransaction.groupBy({
        by: ["category"],
        where: { ...where, type: "expense" },
        _sum: { amount: true },
      }),
      db.financeTransaction.aggregate({ where: { ...where, type: "income" }, _sum: { amount: true } }),
      db.financeTransaction.aggregate({ where: { ...where, type: "expense" }, _sum: { amount: true } }),
      db.financeTransaction.count({ where }),
    ]);

    const income = incomeTotal._sum.amount ?? 0;
    const expense = expenseTotal._sum.amount ?? 0;

    const toCategoryTotals = (
      rows: { category: string; _sum: { amount: number | null } }[]
    ): CategoryTotal[] =>
      rows
        .map((r) => ({ category: r.category, total: r._sum.amount ?? 0 }))
        .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      income,
      expense,
      net: income - expense,
      count,
      incomeByCategory: toCategoryTotals(incomeGrouped),
      expenseByCategory: toCategoryTotals(expenseGrouped),
    });
  } catch (error) {
    console.error("GET /api/finance/summary failed", error);
    return NextResponse.json({ error: "Failed to compute finance summary" }, { status: 500 });
  }
}
