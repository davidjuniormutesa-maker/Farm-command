import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** ISO date string → Date (defaults to now when omitted/empty). */
const harvestDate = z
  .string()
  .refine((s) => s === "" || !Number.isNaN(new Date(s).getTime()), "Invalid date")
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : new Date()));

/** Optional positive number → number | null */
const positiveAmount = z
  .number()
  .positive("Amount must be a positive number")
  .optional()
  .nullable()
  .transform((v) => (typeof v === "number" && isFinite(v) ? v : null));

const harvestSchema = z.object({
  actualHarvestDate: harvestDate,
  harvestQuantity: z.number().positive("Harvest quantity must be a positive number"),
  harvestUnit: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .optional()
    .nullable()
    .transform((v) => v || "kg"),
  saleAmount: positiveAmount,
  recordSale: z.boolean().optional().default(false),
});

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/crops/[id]/harvest — record a harvest on a crop cycle.
 * Sets actualHarvestDate / harvestQuantity / harvestUnit / saleAmount and
 * status = "harvested". When recordSale && saleAmount > 0 it also creates an
 * income FinanceTransaction in the "Crop sales" category linked to the cycle.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const cycle = await db.cropCycle.findUnique({ where: { id } });
    if (!cycle) {
      return NextResponse.json({ error: "Crop cycle not found" }, { status: 404 });
    }

    const parsed = harvestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid harvest data" },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const updated = await db.cropCycle.update({
      where: { id },
      data: {
        status: "harvested",
        actualHarvestDate: data.actualHarvestDate,
        harvestQuantity: data.harvestQuantity,
        harvestUnit: data.harvestUnit,
        saleAmount: data.saleAmount,
      },
      include: { field: { select: { id: true, name: true } } },
    });

    const transaction =
      data.recordSale && data.saleAmount !== null && data.saleAmount > 0
        ? await db.financeTransaction.create({
            data: {
              type: "income",
              category: "Crop sales",
              amount: data.saleAmount,
              date: data.actualHarvestDate,
              description: `${cycle.crop} sale — ${data.harvestQuantity} ${data.harvestUnit}`,
              cropCycleId: id,
              fieldId: cycle.fieldId,
            },
          })
        : null;

    return NextResponse.json({ crop: updated, transaction });
  } catch (error) {
    console.error("POST /api/crops/[id]/harvest failed", error);
    return NextResponse.json({ error: "Failed to record harvest" }, { status: 500 });
  }
}
