import { NextRequest, NextResponse } from "next/server";
import { ingestBriefing } from "@/src/lib/ingest";

export async function POST(req: NextRequest) {
  // Auth check
  const apiKey = process.env.BRIEFING_HUB_API_KEY;
  const auth = req.headers.get("authorization") ?? "";
  if (!apiKey || auth !== `Bearer ${apiKey}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await ingestBriefing(body);
    return NextResponse.json({ ok: true, slug: result.slug, card_count: result.cardCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("Validation failed:")) {
      return NextResponse.json({ ok: false, errors: message }, { status: 400 });
    }
    console.error("[ingest] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
