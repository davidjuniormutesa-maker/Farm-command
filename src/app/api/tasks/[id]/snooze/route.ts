import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { serializeTask } from "../../task-helpers";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const snoozeSchema = z.object({
  days: z.coerce.number().int("Days must be a whole number").positive("Days must be positive").default(1),
});

/** POST /api/tasks/[id]/snooze { days?: number } — push dueDate forward, stays open. */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;

    const parsed = snoozeSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid snooze" },
        { status: 400 }
      );
    }

    const task = await db.task.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (task.status === "done") {
      return NextResponse.json({ error: "Cannot snooze a completed task" }, { status: 400 });
    }
    if (task.status === "cancelled") {
      return NextResponse.json({ error: "Cannot snooze a cancelled task" }, { status: 400 });
    }

    const updated = await db.task.update({
      where: { id },
      data: { dueDate: addDays(new Date(task.dueDate), parsed.data.days) },
    });
    return NextResponse.json(serializeTask(updated));
  } catch (error) {
    console.error("POST /api/tasks/[id]/snooze failed", error);
    return NextResponse.json({ error: "Failed to snooze task" }, { status: 500 });
  }
}
