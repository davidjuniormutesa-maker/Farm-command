import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/knowledge/[id] — remove a knowledge article.
 *
 * Policy: ANY article can be deleted, including curated reference articles.
 * This is intentional and kept simple — the device is the single source of
 * truth, the client always shows a confirmation dialog before calling, and a
 * farmer who wants reference content back can restore it via Settings →
 * "Reset all farm data" followed by a fresh GET (the self-seed re-runs on an
 * empty table). Unknown ids return 404.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const article = await db.knowledgeArticle.findUnique({ where: { id }, select: { id: true } });
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }
    await db.knowledgeArticle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/knowledge/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete the article" }, { status: 500 });
  }
}
