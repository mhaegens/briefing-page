import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { ingestBriefing } from "@/src/lib/ingest";

const MAX_BODY_BYTES = 524288;

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export async function POST(req: NextRequest) {
  const contentLength = req.headers.get("content-length");
  if (!contentLength || parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }

  const apiKey = process.env.BRIEFING_HUB_API_KEY;
  const auth = req.headers.get("authorization") ?? "";
  const isValid =
    apiKey &&
    timingSafeEqual(hashToken(auth), hashToken(`Bearer ${apiKey}`));
  if (!isValid) {
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
