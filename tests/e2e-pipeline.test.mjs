/**
 * E2E smoke test for the full poll-claim-progress-complete pipeline cycle.
 *
 * Starts a lightweight in-process HTTP server that implements the 5 bridge API
 * endpoints (/api/bridge/jobs/next, /claim, /progress, /complete, /fail) and
 * the owner-facing /api/jobs GET and POST, backed by an in-memory SQLite
 * database. Then spawns the bridge child process against this server and
 * watches the job progress to succeeded.
 *
 * Run with: npm test
 * Requires: Node >= 22
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── In-memory database ────────────────────────────────────────────────────────

function createDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress_pct INTEGER,
      progress_label TEXT,
      error_message TEXT,
      input_json TEXT,
      result_json TEXT,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER,
      started_at INTEGER,
      finished_at INTEGER
    );
  `);
  return db;
}

// ── Minimal HTTP server implementing bridge + owner API ───────────────────────

function createHubServer(db, bridgeSecret) {
  function json(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  }

  async function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try {
          resolve(JSON.parse(data || "{}"));
        } catch {
          resolve({});
        }
      });
      req.on("error", reject);
    });
  }

  function checkBridgeAuth(req, res) {
    if (req.headers.authorization !== `Bearer ${bridgeSecret}`) {
      json(res, 401, { error: "Unauthorized" });
      return false;
    }
    return true;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;

    // GET /api/jobs — owner jobs list
    if (req.method === "GET" && path === "/api/jobs") {
      const rows = db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all();
      return json(res, 200, { jobs: rows, last_bridge_seen: null });
    }

    // POST /api/jobs — create job (stub allowed since NODE_ENV=test is set by the E2E test)
    if (req.method === "POST" && path === "/api/jobs") {
      const body = await readBody(req);
      const { job_type, title } = body;
      const allowed = ["plaud","prompt","email","deepen","pdf-clone","sap-note","rfp-response","report","stub"];
      if (!job_type || !allowed.includes(job_type) || !title) {
        return json(res, 400, { error: "Bad request" });
      }
      const now = Math.floor(Date.now() / 1000);
      const result = db
        .prepare("INSERT INTO jobs (job_type, title, status, created_at) VALUES (?, ?, 'queued', ?)")
        .run(job_type, title, now);
      return json(res, 201, { id: result.lastInsertRowid, job_type, title, status: "queued", created_at: now });
    }

    // GET /api/bridge/jobs/next — long-poll for next queued job
    if (req.method === "GET" && path === "/api/bridge/jobs/next") {
      if (!checkBridgeAuth(req, res)) return;
      const job = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get();
      if (job) return json(res, 200, { job });
      // Short-poll mode: wait up to 2s then 204
      const waitMs = Math.min(parseInt(url.searchParams.get("wait_seconds") ?? "0", 10) * 1000, 2000);
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 500)));
      const job2 = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get();
      if (job2) return json(res, 200, { job: job2 });
      return json(res, 204, null);
    }

    // POST /api/bridge/jobs/:id/claim
    const claimMatch = path.match(/^\/api\/bridge\/jobs\/(\d+)\/claim$/);
    if (req.method === "POST" && claimMatch) {
      if (!checkBridgeAuth(req, res)) return;
      const id = parseInt(claimMatch[1], 10);
      const now = Math.floor(Date.now() / 1000);
      const result = db
        .prepare("UPDATE jobs SET status='claimed', claimed_at=? WHERE id=? AND status='queued'")
        .run(now, id);
      if (result.changes === 0) return json(res, 409, { error: "Already claimed" });
      const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
      return json(res, 200, { job });
    }

    // POST /api/bridge/jobs/:id/progress
    const progressMatch = path.match(/^\/api\/bridge\/jobs\/(\d+)\/progress$/);
    if (req.method === "POST" && progressMatch) {
      if (!checkBridgeAuth(req, res)) return;
      const id = parseInt(progressMatch[1], 10);
      const body = await readBody(req);
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        "UPDATE jobs SET status='running', progress_pct=?, progress_label=?, started_at=COALESCE(started_at,?) WHERE id=?"
      ).run(body.pct ?? null, body.label ?? null, now, id);
      return json(res, 200, { ok: true });
    }

    // POST /api/bridge/jobs/:id/complete
    const completeMatch = path.match(/^\/api\/bridge\/jobs\/(\d+)\/complete$/);
    if (req.method === "POST" && completeMatch) {
      if (!checkBridgeAuth(req, res)) return;
      const id = parseInt(completeMatch[1], 10);
      const now = Math.floor(Date.now() / 1000);
      db.prepare("UPDATE jobs SET status='succeeded', finished_at=?, progress_pct=100 WHERE id=?").run(now, id);
      return json(res, 200, { ok: true });
    }

    // POST /api/bridge/jobs/:id/fail
    const failMatch = path.match(/^\/api\/bridge\/jobs\/(\d+)\/fail$/);
    if (req.method === "POST" && failMatch) {
      if (!checkBridgeAuth(req, res)) return;
      const id = parseInt(failMatch[1], 10);
      const body = await readBody(req);
      const now = Math.floor(Date.now() / 1000);
      db.prepare("UPDATE jobs SET status='failed', finished_at=?, error_message=? WHERE id=?")
        .run(now, body.error_message ?? "Unknown error", id);
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: "Not found" });
  });

  return server;
}

// ── test suite ────────────────────────────────────────────────────────────────

describe("E2E: bridge job lifecycle (stub pipeline)", () => {
  let db;
  let hubServer;
  let hubPort;
  let bridgeProc;
  const BRIDGE_SECRET = "test-bridge-secret-e2e";

  before(async () => {
    db = createDb();
    hubServer = createHubServer(db, BRIDGE_SECRET);
    await new Promise((resolve) => hubServer.listen(0, "127.0.0.1", resolve));
    hubPort = hubServer.address().port;
  });

  after(() => {
    hubServer.close();
    if (bridgeProc && !bridgeProc.killed) bridgeProc.kill("SIGTERM");
  });

  it("creates a stub job, bridge processes it, job reaches succeeded with progress_pct > 0", async () => {
    const HUB_URL = `http://127.0.0.1:${hubPort}`;

    // 1. Create job via POST /api/jobs
    const createRes = await fetch(`${HUB_URL}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_type: "stub", title: "E2E test stub job" }),
    });
    assert.equal(createRes.status, 201);
    const { id: jobId } = await createRes.json();
    assert.ok(typeof jobId === "number");

    // 2. Start bridge child process pointing at test hub
    const env = {
      ...process.env,
      NODE_ENV: "test",
      HUB_URL,
      BRIDGE_SECRET,
      VAULT_ROOT: ROOT, // not used by stub but required by config
    };
    bridgeProc = spawn("node", [join(ROOT, "bridge/index.js")], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // 3. Poll GET /api/jobs until job succeeded or timeout
    const deadline = Date.now() + 10_000;
    let finalJob = null;
    let sawProgress = false;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      const res = await fetch(`${HUB_URL}/api/jobs`);
      const data = await res.json();
      const job = data.jobs.find((j) => j.id === jobId);
      if (!job) continue;
      if (job.progress_pct !== null && job.progress_pct > 0) sawProgress = true;
      if (job.status === "succeeded" || job.status === "failed") {
        finalJob = job;
        break;
      }
    }

    // 4. Stop bridge
    bridgeProc.kill("SIGTERM");
    bridgeProc = null;

    assert.ok(finalJob, "Job did not complete within 10 seconds");
    assert.equal(finalJob.status, "succeeded", `Expected succeeded but got ${finalJob.status}: ${finalJob.error_message}`);
    assert.ok(sawProgress, "progress_pct was never updated above 0 before succeeded");
  });
});
