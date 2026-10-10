import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { taskBodySchema, serializeTask, validateTaskLinks } from "../task-helpers";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const TASK_INCLUDE = {
  animal: { select: { tagId: true, name: true } },
  group: { select: { name: true } },
  cropCycle: { select: { crop: true } },
  field: { select: { name: true } },
} as const;

/** GET /api/tasks/[id] — single task with links. */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const task = await db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json(serializeTask(task));
  } catch (error) {
    console.error("GET /api/tasks/[id] failed", error);
    return NextResponse.json({ error: "Failed to load task" }, { status: 500 });
  }
}

/** PUT /api/tasks/[id] — full edit (also allows status open <-> cancelled). */
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const raw = await req.json().catch(() => null);

    const parsed = taskBodySchema()
      .extend({ status: z.enum(["open", "cancelled"]).optional() })
      .safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid task" },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const linkError = await validateTaskLinks(body);
    if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });

    const task = await db.task.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description || null,
        category: body.category,
        dueDate: new Date(body.dueDate),
        dueTime: body.dueTime || null,
        priority: body.priority,
        repeatRule: body.repeatRule,
        repeatIntervalDays:
          body.repeatRule === "custom_days" ? (body.repeatIntervalDays ?? null) : null,
        leadTimeDays: body.leadTimeDays ?? 0,
        animalId: body.animalId || null,
        groupId: body.groupId || null,
        cropCycleId: body.cropCycleId || null,
        fieldId: body.fieldId || null,
        assignee: body.assignee || null,
        notes: body.notes || null,
        // Reopening a task clears the completed timestamp
        ...(body.status
          ? { status: body.status, ...(body.status === "open" ? { completedAt: null } : {}) }
          : {}),
      },
      include: TASK_INCLUDE,
    });
    return NextResponse.json(serializeTask(task));
  } catch (error) {
    console.error("PUT /api/tasks/[id] failed", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

/** DELETE /api/tasks/[id] */
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    await db.task.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/tasks/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
