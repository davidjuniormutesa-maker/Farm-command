import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const optTrimmed = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === "" || v === null ? null : v));

const transactionSchema = z.object({
  type: z.enum(["income", "expense"], { message: "Type must be income or expense" }),
  category: z.string().trim().min(1, "Category is required").max(80),
  amount: z.coerce.number({ message: "Amount is required" }).positive("Amount must be greater than 0").max(1e12),
  date: z
    .string()
    .min(1, "Date is required")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Date must be a valid date"),
  description: z.string().trim().min(1, "Description is required").max(500),
  paymentMethod: optTrimmed,
  cropCycleId: optTrimmed,
  fieldId: optTrimmed,
  animalId: optTrimmed,
  groupId: optTrimmed,
});

/** Verify optional link targets actually exist (400 instead of an opaque FK error). */
async function validateLinks(data: z.infer<typeof transactionSchema>): Promise<string | null> {
  if (data.cropCycleId && !(await db.cropCycle.findUnique({ where: { id: data.cropCycleId } }))) {
    return "The selected crop cycle no longer exists";
  }
  if (data.fieldId && !(await db.field.findUnique({ where: { id: data.fieldId } }))) {
    return "The selected field no longer exists";
  }
  if (data.animalId && !(await db.animal.findUnique({ where: { id: data.animalId } }))) {
    return "The selected animal no longer exists";
  }
  if (data.groupId && !(await db.livestockGroup.findUnique({ where: { id: data.groupId } }))) {
    return "The selected group no longer exists";
  }
  return null;
}

const LINK_INCLUDE = {
  animal: { select: { id: true, tagId: true, name: true } },
  field: { select: { id: true, name: true } },
  cropCycle: { select: { id: true, crop: true, variety: true } },
  group: { select: { id: true, name: true } },
} satisfies Prisma.FinanceTransactionInclude;

type FinanceRow = Prisma.FinanceTransactionGetPayload<{ include: typeof LINK_INCLUDE }>;

function serialize(row: FinanceRow) {
  return {
    ...row,
    date: row.date.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** GET /api/finance?type=&category=&from=&to= — transactions, newest first, with linked names. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const category = searchParams.get("category");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.FinanceTransactionWhereInput = {};
    if (type === "income" || type === "expense") where.type = type;
    if (category) where.category = category;

    const dateFilter: Prisma.DateTimeFilter = {};
    if (from && !Number.isNaN(new Date(from).getTime())) dateFilter.gte = new Date(from);
    if (to && !Number.isNaN(new Date(to).getTime())) dateFilter.lte = new Date(to);
    if (dateFilter.gte || dateFilter.lte) where.date = dateFilter;

    const rows = await db.financeTransaction.findMany({
      where: { ...where, deletedAt: null },
      include: LINK_INCLUDE,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 2000,
    });

    return NextResponse.json(rows.map(serialize));
  } catch (error) {
    console.error("GET /api/finance failed", error);
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
}

/** POST /api/finance — record an income or expense. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = transactionSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid transaction";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const linkError = await validateLinks(parsed.data);
    if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });

    const row = await db.financeTransaction.create({
      data: {
        type: parsed.data.type,
        category: parsed.data.category,
        amount: parsed.data.amount,
        date: new Date(parsed.data.date),
        description: parsed.data.description,
        paymentMethod: parsed.data.paymentMethod,
        cropCycleId: parsed.data.cropCycleId,
        fieldId: parsed.data.fieldId,
        animalId: parsed.data.animalId,
        groupId: parsed.data.groupId,
      },
      include: LINK_INCLUDE,
    });

    return NextResponse.json(serialize(row), { status: 201 });
  } catch (error) {
    console.error("POST /api/finance failed", error);
    return NextResponse.json({ error: "Failed to record transaction" }, { status: 500 });
  }
}
