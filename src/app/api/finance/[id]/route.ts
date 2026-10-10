import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

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
};

function serialize(row: { date: Date; createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return {
    ...row,
    date: row.date.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** PUT /api/finance/[id] — full update of a transaction. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await db.financeTransaction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = transactionSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid transaction";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const linkError = await validateLinks(parsed.data);
    if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });

    const row = await db.financeTransaction.update({
      where: { id },
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

    return NextResponse.json(serialize(row));
  } catch (error) {
    console.error("PUT /api/finance/[id] failed", error);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

/** DELETE /api/finance/[id] */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await db.financeTransaction.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    await db.financeTransaction.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/finance/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
}
