import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { briefings, cards } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requireOwner } from "@/src/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireOwner(req);
  } catch (res) {
    return res as Response;
  }
  const { slug } = await params;
  try {
    const db = getDb();
    const [briefing] = db
      .select()
      .from(briefings)
      .where(eq(briefings.slug, slug))
      .limit(1)
      .all();

    if (!briefing || briefing.status === "deleted") {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Auto-advance unread → in_progress
    if (briefing.status === "unread") {
      db.update(briefings)
        .set({ status: "in_progress" })
        .where(eq(briefings.id, briefing.id))
        .run();
      briefing.status = "in_progress";
    }

    const cardRows = db
      .select()
      .from(cards)
      .where(and(eq(cards.briefing_id, briefing.id)))
      .orderBy(asc(cards.position))
      .all();

    const cardList = cardRows.map((c) => ({
      id: c.id,
      position: c.position,
      type: c.type,
      priority: c.priority,
      title: c.title,
      summary: c.summary,
      body: c.body ? (JSON.parse(c.body) as string[]) : [],
      content: c.content ? JSON.parse(c.content) : [],
      meta: c.meta,
      action_label: c.action_label,
      reference: c.reference,
      status: c.status,
      action_choice: c.action_choice,
    }));

    return NextResponse.json({
      slug: briefing.slug,
      title: briefing.title,
      source: {
        name: briefing.source_name,
        mark: briefing.source_mark,
        tone: briefing.source_tone,
      },
      status: briefing.status,
      created_at: briefing.created_at,
      cards: cardList,
    });
  } catch (err) {
    console.error(`[GET /api/briefings/${slug}]`, err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
