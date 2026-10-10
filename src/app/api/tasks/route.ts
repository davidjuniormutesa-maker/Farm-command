import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskBodySchema, serializeTask, validateTaskLinks } from "./task-helpers";

export const dynamic = "force-dynamic";

const TASK_INCLUDE = {
  animal: { select: { tagId: true, name: true } },
  group: { select: { name: true } },
  cropCycle: { select: { crop: true } },
  field: { select: { name: true } },
} as const;

/** GET /api/tasks — all tasks, soonest due first, with linked display entities. */
export async function GET() {
  try {
    const tasks = await db.task.findMany({
      where: { deletedAt: null },
      orderBy: { dueDate: "asc" },
      include: TASK_INCLUDE,
    });
    return NextResponse.json(tasks.map(serializeTask));
  } catch (error) {
    console.error("GET /api/tasks failed", error);
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }
}

/** POST /api/tasks — create a task/reminder. */
export async function POST(req: NextRequest) {
  try {
    const parsed = taskBodySchema().safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid task" },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const linkError = await validateTaskLinks(body);
    if (linkError) return NextResponse.json({ error: linkError }, { status: 400 });

    const task = await db.task.create({
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
        status: "open",
        notes: body.notes || null,
      },
      include: TASK_INCLUDE,
    });
    return NextResponse.json(serializeTask(task), { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks failed", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
