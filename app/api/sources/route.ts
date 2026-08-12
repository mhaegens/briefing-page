import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { agent_sources } from "@/db/schema";
import { sql } from "drizzle-orm";
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
      .select()
      .from(agent_sources)
      .orderBy(sql`${agent_sources.last_briefing_at} desc nulls last`)
      .all();

    return NextResponse.json({ sources: rows });
  } catch (err) {
    console.error("[GET /api/sources]", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
