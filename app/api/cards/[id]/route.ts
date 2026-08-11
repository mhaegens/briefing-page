import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { cards } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (isNaN(cardId)) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  let body: { status?: string; action_choice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { status, action_choice } = body;
  if (status !== "reviewed" && status !== "actioned") {
    return NextResponse.json(
      { ok: false, error: "status must be 'reviewed' or 'actioned'" },
      { status: 400 }
    );
  }
  if (status === "actioned" && !action_choice) {
    return NextResponse.json(
      { ok: false, error: "action_choice required when status is 'actioned'" },
      { status: 400 }
    );
  }

  try {
    const db = getDb();
    const [card] = db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).limit(1).all();
    if (!card) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    db.update(cards)
      .set({
        status: status as "reviewed" | "actioned",
        action_choice: action_choice ?? null,
        reviewed_at: new Date(),
      })
      .where(eq(cards.id, cardId))
      .run();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[PATCH /api/cards/${id}]`, err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
