import { NextRequest, NextResponse } from "next/server";
import { getSqlite, getDb } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";

function requireBridgeSecret(req: NextRequest): NextResponse | null {
  const bridgeSecret = process.env.BRIDGE_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!bridgeSecret || auth !== `Bearer ${bridgeSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireBridgeSecret(req);
  if (authError) return authError;

  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const [job] = db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, jobId)).limit(1).all();
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { error_message?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  const sqlite = getSqlite();
  const now = Math.floor(Date.now() / 1000);

  sqlite
    .prepare("UPDATE jobs SET status='failed', finished_at=?, error_message=? WHERE id=?")
    .run(now, body.error_message ?? null, jobId);

  return NextResponse.json({ ok: true }, { status: 200 });
}
