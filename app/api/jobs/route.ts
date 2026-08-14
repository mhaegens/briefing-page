import { NextRequest, NextResponse } from "next/server";
import { getDb, getSqlite } from "@/db";
import { jobs } from "@/db/schema";
import { desc, max } from "drizzle-orm";
import { requireOwner } from "@/src/lib/auth";

const VALID_JOB_TYPES = ["plaud", "prompt", "email", "deepen", "pdf-clone", "sap-note", "rfp-response", "report", "email-fetch", "email-commit"] as const;
const TEST_ONLY_JOB_TYPES = ["stub"] as const;

export async function GET(request: NextRequest) {
  try {
    await requireOwner(request);
  } catch (res) {
    return res as Response;
  }

  const db = getDb();
  const rows = db
    .select({
      id: jobs.id,
      job_type: jobs.job_type,
      title: jobs.title,
      status: jobs.status,
      progress_pct: jobs.progress_pct,
      progress_label: jobs.progress_label,
      error_message: jobs.error_message,
      created_at: jobs.created_at,
      claimed_at: jobs.claimed_at,
      started_at: jobs.started_at,
      finished_at: jobs.finished_at,
    })
    .from(jobs)
    .orderBy(desc(jobs.created_at))
    .all();

  const jobList = rows.map((j) => ({
    ...j,
    error_message: j.error_message ? j.error_message.slice(-200) : null,
  }));

  const [lastBridgeRow] = db.select({ last: max(jobs.claimed_at) }).from(jobs).all();
  const last_bridge_seen = lastBridgeRow?.last ?? null;

  return NextResponse.json({ jobs: jobList, last_bridge_seen });
}

export async function POST(request: NextRequest) {
  try {
    await requireOwner(request);
  } catch (res) {
    return res as Response;
  }

  let body: { job_type?: string; title?: string; input?: { path?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { job_type, title, input } = body;

  const isTestMode = process.env.NODE_ENV === "test";
  const allowedTypes: readonly string[] = isTestMode
    ? [...VALID_JOB_TYPES, ...TEST_ONLY_JOB_TYPES]
    : VALID_JOB_TYPES;

  if (!job_type || !allowedTypes.includes(job_type)) {
    return NextResponse.json(
      { error: `job_type must be one of: ${VALID_JOB_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const sqlite = getSqlite();
  const now = Math.floor(Date.now() / 1000);
  const inputJson = input ? JSON.stringify(input) : null;

  const result = sqlite
    .prepare("INSERT INTO jobs (job_type, title, status, input_json, created_at) VALUES (?, ?, 'queued', ?, ?)")
    .run(job_type, title, inputJson, now);

  const jobId = result.lastInsertRowid as number;
  return NextResponse.json(
    { id: jobId, job_type, title, status: "queued", created_at: now },
    { status: 201 }
  );
}
