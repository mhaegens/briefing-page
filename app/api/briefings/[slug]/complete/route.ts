import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import { getDb, getSqlite } from "@/db";
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
    const sqlite = getSqlite();
    const [briefing] = db
      .select()
      .from(briefings)
      .where(eq(briefings.slug, slug))
      .limit(1)
      .all();

    if (!briefing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Enable secure deletion so purged data is overwritten
    sqlite.pragma("secure_delete = ON");

    // 1. Delete the JSON file (idempotent)
    if (briefing.json_path) {
      try {
        fs.unlinkSync(briefing.json_path);
      } catch {
        // File already gone — proceed
      }
    }

    // Count actioned cards before purge
    const allCards = db
      .select({ status: cards.status })
      .from(cards)
      .where(eq(cards.briefing_id, briefing.id))
      .all();
    const actionsCount = allCards.filter((c) => c.status === "actioned").length;

    // 2. Null out card content in transaction
    sqlite.transaction(() => {
      sqlite.prepare(
        "UPDATE cards SET title=NULL, summary=NULL, body=NULL, content=NULL, action_label=NULL, reference=NULL WHERE briefing_id=?"
      ).run(briefing.id);
      // 3. Tombstone briefing: null content columns, mark deleted
      sqlite.prepare(
        "UPDATE briefings SET title=NULL, source_name=NULL, source_mark=NULL, source_tone=NULL, json_path=NULL, status='deleted', completed_at=unixepoch() WHERE id=?"
      ).run(briefing.id);
    })();

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
