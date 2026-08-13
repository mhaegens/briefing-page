import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { briefings, cards } from "@/db/schema";
import { ne, eq, sql } from "drizzle-orm";
import { requireOwner } from "@/src/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireOwner(request);
  } catch (res) {
    return res as Response;
  }
  try {
    const db = getDb();
    const rows = db
      .select({
        slug: briefings.slug,
        title: briefings.title,
        source_name: briefings.source_name,
        source_mark: briefings.source_mark,
        source_tone: briefings.source_tone,
        status: briefings.status,
        created_at: briefings.created_at,
        card_count: sql<number>`count(${cards.id})`,
        unread_count: sql<number>`sum(case when ${cards.status} = 'unread' then 1 else 0 end)`,
        attention_count: sql<number>`sum(case when ${cards.status} = 'unread' and ${cards.priority} in ('critical', 'high') then 1 else 0 end)`,
      })
      .from(briefings)
      .leftJoin(cards, eq(cards.briefing_id, briefings.id))
      .where(ne(briefings.status, "deleted"))
      .groupBy(briefings.id)
      .orderBy(sql`${briefings.created_at} desc`)
      .all();

    const result = rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      source: { name: r.source_name, mark: r.source_mark, tone: r.source_tone },
      status: r.status,
      card_count: r.card_count ?? 0,
      unread_count: r.unread_count ?? 0,
      attention_count: r.attention_count ?? 0,
      created_at: r.created_at,
    }));

    return NextResponse.json({ briefings: result });
  } catch (err) {
    console.error("[GET /api/briefings]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
