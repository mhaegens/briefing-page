import { NextRequest, NextResponse } from "next/server";
import { getDb, getSqlite } from "@/db";
import { cards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOwner } from "@/src/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner(req);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (isNaN(cardId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const [card] = db
    .select({
      id: cards.id,
      action_job_type: cards.action_job_type,
      action_job_title: cards.action_job_title,
      action_job_input: cards.action_job_input,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1)
    .all();

  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!card.action_job_type) {
    return NextResponse.json({ error: "No action configured for this card" }, { status: 400 });
  }

  const inputJson = card.action_job_input
    ? card.action_job_input
    : null;

  const sqlite = getSqlite();
  const now = Math.floor(Date.now() / 1000);

  const result = sqlite
    .prepare("INSERT INTO jobs (job_type, title, status, input_json, created_at) VALUES (?, ?, 'queued', ?, ?)")
    .run(card.action_job_type, card.action_job_title ?? card.action_job_type, inputJson, now);

  const jobId = result.lastInsertRowid as number;
  return NextResponse.json({ job_id: jobId }, { status: 201 });
}
