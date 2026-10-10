import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { CURATED_ARTICLES, CURATED_TITLES } from "./seed-articles";

export const dynamic = "force-dynamic";

/**
 * GET /api/knowledge            → all articles, newest retrieved first
 * GET /api/knowledge?topic=Crops → filtered by topic (Crops|Livestock|Water|Climate|Business)
 *
 * Self-seeding: if the KnowledgeArticle table is empty (first launch / fresh
 * database), a curated set of Zambia-first reference articles is inserted so
 * the Knowledge Hub is useful immediately. Seeding is idempotent — it only
 * runs against an empty table, so a farmer's own notes are never overwritten.
 *
 * Each returned article carries a computed `userAdded` flag: true for anything
 * that is not part of the curated reference set (custom notes saved by the
 * farmer, restored backups of their notes, etc.). The UI uses it for the
 * "My notes" filter; DELETE intentionally allows removing any article (the
 * client always asks for confirmation first).
 */
export async function GET(req: NextRequest) {
  try {
    // Self-seed once when the table is empty.
    const existing = await db.knowledgeArticle.count();
    if (existing === 0) {
      const now = new Date();
      await db.$transaction(
        CURATED_ARTICLES.map((a) =>
          db.knowledgeArticle.create({
            data: {
              title: a.title,
              topic: a.topic,
              source: a.source,
              sourceUrl: a.sourceUrl ?? null,
              publishedDate: a.publishedDate ?? null,
              retrievedDate: now,
              summary: a.summary,
              content: a.content,
            },
          })
        )
      );
    }

    const topic = req.nextUrl.searchParams.get("topic");
    const articles = await db.knowledgeArticle.findMany({
      where: { ...(topic ? { topic } : {}), deletedAt: null },
      orderBy: [{ retrievedDate: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(
      articles.map((a) => ({
        ...a,
        // Dates cross the API boundary as ISO strings (convention #6).
        retrievedDate: a.retrievedDate.toISOString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        userAdded: !CURATED_TITLES.has(a.title),
      }))
    );
  } catch (error) {
    console.error("GET /api/knowledge failed", error);
    return NextResponse.json({ error: "Failed to load knowledge articles" }, { status: 500 });
  }
}

/**
 * POST /api/knowledge — save a custom note / article.
 * Farmers keep their own knowledge (agronomy tips from the co-op, vet advice,
 * personal reminders about a field…) alongside the curated reference set.
 * All text fields are required and non-empty except sourceUrl.
 */
const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
  topic: z.enum(["Crops", "Livestock", "Water", "Climate", "Business"], {
    message: "Choose a topic",
  }),
  source: z.string().trim().min(1, "Source is required").max(200, "Source is too long").default("My notes"),
  sourceUrl: z
    .union([z.string().trim().max(500, "URL is too long"), z.literal("")])
    .optional()
    .transform((v) => {
      const s = (v ?? "").trim();
      if (!s) return null;
      try {
        // Light validation — accept anything the URL parser accepts.
        new URL(s);
        return s;
      } catch {
        return null;
      }
    }),
  summary: z.string().trim().min(1, "Summary is required").max(400, "Keep the summary under 400 characters"),
  content: z.string().trim().min(1, "Content is required").max(20000, "Note is too long"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid note";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const article = await db.knowledgeArticle.create({
      data: {
        title: parsed.data.title,
        topic: parsed.data.topic,
        source: parsed.data.source,
        sourceUrl: parsed.data.sourceUrl,
        summary: parsed.data.summary,
        content: parsed.data.content,
      },
    });

    return NextResponse.json(
      {
        ...article,
        retrievedDate: article.retrievedDate.toISOString(),
        createdAt: article.createdAt.toISOString(),
        updatedAt: article.updatedAt.toISOString(),
        userAdded: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/knowledge failed", error);
    return NextResponse.json({ error: "Failed to save the note" }, { status: 500 });
  }
}
