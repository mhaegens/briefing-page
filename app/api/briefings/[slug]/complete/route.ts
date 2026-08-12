import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import { getDb } from "@/db";
import { briefings, cards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOwner } from "@/src/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireOwner(req);
  } catch (res) {
    return res as Response;
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "Unsupported Media Type" }, { status: 415 });
  }

  if (process.env.NODE_ENV === "production") {
    const origin = req.headers.get("origin") ?? "";
    if (origin !== "https://brief.haegens.be") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
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

    if (!briefing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // 1. Delete the JSON file (idempotent)
    if (briefing.json_path) {
      try {
        fs.unlinkSync(briefing.json_path);
      } catch {
        // File already gone — proceed
      }
    }

    // 2. Null out card content
    db.update(cards)
      .set({ title: null, summary: null, body: null, content: null, action_label: null, reference: null })
      .where(eq(cards.briefing_id, briefing.id))
      .run();

    // 3. Mark briefing deleted
    db.update(briefings)
      .set({ status: "deleted", completed_at: new Date() })
      .where(eq(briefings.id, briefing.id))
      .run();

    // Count actioned cards for response
    const allCards = db
      .select({ status: cards.status })
      .from(cards)
      .where(eq(cards.briefing_id, briefing.id))
      .all();
    const actionsCount = allCards.filter((c) => c.status === "actioned").length;

    // Decrement agent source unread count
    const { agent_sources } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    db.update(agent_sources)
      .set({ unread_count: sql`max(0, ${agent_sources.unread_count} - 1)` })
      .where(eq(agent_sources.name, briefing.source_name))
      .run();

    return NextResponse.json({ ok: true, actions_count: actionsCount });
  } catch (err) {
    console.error(`[POST /api/briefings/${slug}/complete]`, err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
