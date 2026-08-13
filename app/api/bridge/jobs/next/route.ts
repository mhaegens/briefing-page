import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
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

export async function GET(req: NextRequest) {
  const authError = requireBridgeSecret(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const waitSeconds = Math.min(30, Math.max(0, parseInt(url.searchParams.get("wait_seconds") ?? "0", 10) || 0));

  const db = getDb();
  const deadline = Date.now() + waitSeconds * 1000;

  while (true) {
    const [job] = db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .orderBy(jobs.created_at)
      .limit(1)
      .all();

    if (job) {
      return NextResponse.json({ job }, { status: 200 });
    }

    if (Date.now() >= deadline) {
      return new NextResponse(null, { status: 204 });
    }

    await new Promise((r) => setTimeout(r, 500));
  }
}
