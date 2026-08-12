import { NextRequest, NextResponse } from "next/server";
import { getDb, getSqlite } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOwner } from "@/src/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOwner(request);
  } catch (res) {
    return res as Response;
  }

  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const [job] = db.select({ id: jobs.id, status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1).all();
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (job.status !== "queued") {
    return NextResponse.json({ error: "Job is not in a cancellable state" }, { status: 409 });
  }

  const sqlite = getSqlite();
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare("UPDATE jobs SET status='cancelled', finished_at=? WHERE id=? AND status='queued'").run(now, jobId);

  return NextResponse.json({ ok: true }, { status: 200 });
}
