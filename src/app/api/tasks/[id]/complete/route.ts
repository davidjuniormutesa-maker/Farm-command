import { NextRequest, NextResponse } from "next/server";
import { addDays, addMonths } from "date-fns";
import { db } from "@/lib/db";
import { serializeTask } from "../../task-helpers";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST /api/tasks/[id]/complete — mark a task done; recurring tasks auto-schedule
 * the next occurrence (recurrence contract, worklog Task 1 §12):
 *   daily → +1 day · weekly → +7 days · monthly → +1 calendar month (month-end clamped)
 *   custom_days → + repeatIntervalDays
 * The next occurrence copies title/description/category/links/assignee/priority/
 * dueTime/repeat fields/notes, is open, and never copies vaccinationId.
 */
export async function POST(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;

    const task = await db.task.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (task.status === "done") {
      return NextResponse.json({ error: "Task is already completed" }, { status: 400 });
    }
    if (task.status === "cancelled") {
      return NextResponse.json({ error: "Cannot complete a cancelled task" }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const isRecurring = task.repeatRule !== "once";
      const customInterval =
        task.repeatRule === "custom_days" ? task.repeatIntervalDays ?? 0 : 0;

      let nextId: string | null = null;

      if (isRecurring && (task.repeatRule !== "custom_days" || customInterval > 0)) {
        const base = new Date(task.dueDate);
        let nextDue: Date;
        switch (task.repeatRule) {
          case "daily":
            nextDue = addDays(base, 1);
            break;
          case "weekly":
            nextDue = addDays(base, 7);
            break;
          case "monthly":
            // addMonths clamps month-end overflow (e.g. Jan 31 → Feb 28)
            nextDue = addMonths(base, 1);
            break;
          case "custom_days":
          default:
            nextDue = addDays(base, customInterval);
            break;
        }

        const next = await tx.task.create({
          data: {
            title: task.title,
            description: task.description,
            category: task.category,
            dueDate: nextDue,
            dueTime: task.dueTime,
            priority: task.priority,
            repeatRule: task.repeatRule,
            repeatIntervalDays: task.repeatIntervalDays,
            leadTimeDays: task.leadTimeDays,
            animalId: task.animalId,
            groupId: task.groupId,
            cropCycleId: task.cropCycleId,
            fieldId: task.fieldId,
            assignee: task.assignee,
            status: "open",
            vaccinationId: null, // never carry vaccination linkage forward
            notes: task.notes,
          },
        });
        nextId = next.id;
      }

      const completed = await tx.task.update({
        where: { id },
        data: {
          status: "done",
          completedAt: new Date(),
          ...(nextId ? { nextOccurrenceId: nextId } : {}),
        },
      });

      return { completed };
    });

    // Re-read the next occurrence (created inside the transaction) for the response
    const next = result.completed.nextOccurrenceId
      ? await db.task.findUnique({ where: { id: result.completed.nextOccurrenceId } })
      : null;

    return NextResponse.json({
      completed: serializeTask(result.completed),
      next: next ? serializeTask(next) : null,
    });
  } catch (error) {
    console.error("POST /api/tasks/[id]/complete failed", error);
    return NextResponse.json({ error: "Failed to complete task" }, { status: 500 });
  }
}

// recurrence: daily +1 · weekly +7 · monthly +1mo (clamped) · custom_days +N
