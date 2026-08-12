"use client";

import { useEffect, useRef, useState } from "react";

export type Job = {
  id: number;
  job_type: string;
  title: string;
  status: string;
  progress_pct: number | null;
  progress_label: string | null;
  error_message: string | null;
  created_at: number;
  claimed_at: number | null;
  started_at: number | null;
  finished_at: number | null;
};

const PIPELINE_NAMES: Record<string, string> = {
  plaud: "Sync Plaud recordings",
  prompt: "Run prompt pipeline",
  email: "Process email",
  deepen: "Deepen research",
  "pdf-clone": "Clone PDF document",
  "sap-note": "Process SAP note",
  "rfp-response": "Generate RFP response",
  report: "Generate report",
};

type PipelineDef = {
  job_type: string;
  label: string;
  pathPlaceholder?: string;
  pathRequired?: boolean;
};

const PIPELINES: PipelineDef[] = [
  { job_type: "plaud", label: "Sync Plaud recordings" },
  { job_type: "prompt", label: "Ingest document or URL", pathPlaceholder: "File path or URL" },
  { job_type: "email", label: "Process inbox emails" },
  { job_type: "deepen", label: "Deepen knowledge", pathPlaceholder: "Target note path" },
  { job_type: "pdf-clone", label: "Clone PDF to Markdown", pathPlaceholder: "PDF file path", pathRequired: true },
  { job_type: "sap-note", label: "Ingest SAP note", pathPlaceholder: "Note file or URL" },
  { job_type: "rfp-response", label: "Process RFP requirements", pathPlaceholder: "Requirements file path", pathRequired: true },
  { job_type: "report", label: "Push briefing report" },
];

function autoTitle(jobType: string): string {
  const d = new Date();
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = d.getFullYear();
  const label = PIPELINE_NAMES[jobType] ?? jobType;
  return `${label} — ${day} ${month} ${year}`;
}

function relativeTime(epochSeconds: number): string {
  const diffSeconds = Math.floor(Date.now() / 1000) - epochSeconds;
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} min ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function StatusPill({ status }: { status: string }) {
  const classes: Record<string, string> = {
    running: "status-pill running",
    queued: "status-pill queued",
    succeeded: "status-pill succeeded",
    failed: "status-pill failed",
    cancelled: "status-pill cancelled",
  };
  return <span className={classes[status] ?? "status-pill queued"}>{status}</span>;
}

function JobCard({ job }: { job: Job }) {
  return (
    <article className="agents-job-card">
      <div className="job-card-top">
        <div className="job-card-info">
          <strong className="job-pipeline-name">{PIPELINE_NAMES[job.job_type] ?? job.job_type}</strong>
          <span className="job-title">{job.title}</span>
        </div>
        <div className="job-card-meta">
          <StatusPill status={job.status} />
          <time className="job-time">{relativeTime(job.created_at)}</time>
        </div>
      </div>
      {job.status === "running" && (
        <div className="job-progress" aria-label={`Progress: ${job.progress_pct ?? 0}%`}>
          <div className="job-progress-track">
            <span
              className="job-progress-fill"
              style={{ width: `${job.progress_pct ?? 0}%` }}
            />
          </div>
          {job.progress_label && <span className="job-progress-label">{job.progress_label}</span>}
        </div>
      )}
      {job.status === "failed" && job.error_message && (
        <p className="job-error">{job.error_message}</p>
      )}
    </article>
  );
}

function TriggerPanel({ onJobCreated }: { onJobCreated: (job: Job) => void }) {
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [cooling, setCooling] = useState<Record<string, boolean>>({});

  async function run(def: PipelineDef) {
    const path = paths[def.job_type]?.trim() ?? "";
    setCooling((c) => ({ ...c, [def.job_type]: true }));
    setTimeout(() => setCooling((c) => ({ ...c, [def.job_type]: false })), 2000);

    const body: { job_type: string; title: string; input?: { path: string } } = {
      job_type: def.job_type,
      title: autoTitle(def.job_type),
    };
    if (path) body.input = { path };

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const data = await res.json();
      const newJob: Job = {
        id: data.id,
        job_type: data.job_type,
        title: data.title,
        status: data.status,
        progress_pct: null,
        progress_label: null,
        error_message: null,
        created_at: data.created_at,
        claimed_at: null,
        started_at: null,
        finished_at: null,
      };
      onJobCreated(newJob);
      if (def.pathPlaceholder) {
        setPaths((p) => ({ ...p, [def.job_type]: "" }));
      }
    } catch {
      // ignore
    }
  }

  return (
    <section className="trigger-panel">
      <div className="section-heading">
        <div><span className="eyebrow">Pipelines</span><h2 className="trigger-heading">Run a pipeline</h2></div>
      </div>
      <div className="trigger-list">
        {PIPELINES.map((def) => {
          const path = paths[def.job_type] ?? "";
          const disabled = cooling[def.job_type] || (def.pathRequired && !path.trim());
          return (
            <div className="trigger-row" key={def.job_type}>
              <span className="trigger-label">{def.label}</span>
              {def.pathPlaceholder && (
                <input
                  className="trigger-path"
                  type="text"
                  placeholder={def.pathPlaceholder}
                  value={path}
                  onChange={(e) => setPaths((p) => ({ ...p, [def.job_type]: e.target.value }))}
                  aria-label={`${def.label} path`}
                />
              )}
              <button
                className="trigger-run"
                disabled={disabled}
                onClick={() => run(def)}
                aria-label={`Run ${def.label}`}
              >
                {cooling[def.job_type] ? "Queued" : "Run →"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function AgentsView({ onJobsChange }: { onJobsChange?: (activeCount: number) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [fetching, setFetching] = useState(true);
  const [lastBridgeSeen, setLastBridgeSeen] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  function updateJobs(list: Job[]) {
    setJobs(list);
    const activeCount = list.filter((j) => j.status === "queued" || j.status === "running").length;
    onJobsChange?.(activeCount);
    return activeCount;
  }

  async function fetchJobs(): Promise<number> {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return 0;
      const data = await res.json();
      setLastBridgeSeen(data.last_bridge_seen ?? null);
      return updateJobs(data.jobs ?? []);
    } catch {
      return 0;
    }
  }

  function schedulePoll() {
    if (cancelledRef.current) return;
    pollRef.current = setTimeout(async () => {
      const activeCount = await fetchJobs();
      if (activeCount > 0) schedulePoll();
    }, 5000);
  }

  useEffect(() => {
    cancelledRef.current = false;
    setFetching(true);
    fetchJobs().then((activeCount) => {
      setFetching(false);
      if (activeCount > 0) schedulePoll();
    });
    return () => {
      cancelledRef.current = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleJobCreated(newJob: Job) {
    setJobs((prev) => [newJob, ...prev]);
    onJobsChange?.(
      [newJob, ...jobs].filter((j) => j.status === "queued" || j.status === "running").length
    );
    // Kick off polling since we have a queued job
    if (!pollRef.current) schedulePoll();
  }

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const done = jobs.filter((j) => j.status === "succeeded" || j.status === "cancelled");
  const failed = jobs.filter((j) => j.status === "failed");

  const now = Math.floor(Date.now() / 1000);
  const bridgeOnline = lastBridgeSeen !== null && now - lastBridgeSeen <= 90;

  return (
    <div className="agents-page page-view content-page">
      <div className="page-heading">
        <div><span className="eyebrow">Agents</span><h1>Pipeline jobs.</h1></div>
        <p>Trigger and monitor Mitchell ingest pipelines from here.</p>
      </div>

      <div className={`bridge-chip ${bridgeOnline ? "online" : "offline"}`} aria-live="polite">
        <span className="bridge-dot" aria-hidden="true" />
        {bridgeOnline ? "Bridge online" : "Bridge offline — jobs will wait"}
      </div>

      {!fetching && jobs.length === 0 && (
        <p className="agents-empty">No agent jobs yet. Trigger a pipeline below.</p>
      )}

      {fetching && jobs.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: "12px" }}>Loading…</p>
      )}

      {active.length > 0 && (
        <section className="job-section">
          <h2 className="job-section-heading">Active</h2>
          <div className="job-list">
            {active.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="job-section">
          <h2 className="job-section-heading">Done</h2>
          <div className="job-list">
            {done.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <section className="job-section">
          <h2 className="job-section-heading">Failed</h2>
          <div className="job-list">
            {failed.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        </section>
      )}

      <TriggerPanel onJobCreated={handleJobCreated} />
    </div>
  );
}
