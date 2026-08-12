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

export default function AgentsView({ onJobsChange }: { onJobsChange?: (activeCount: number) => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [fetching, setFetching] = useState(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchJobs() {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return;
      const data = await res.json();
      const list: Job[] = data.jobs ?? [];
      setJobs(list);
      const activeCount = list.filter((j) => j.status === "queued" || j.status === "running").length;
      onJobsChange?.(activeCount);
      return activeCount;
    } catch {
      return 0;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      setFetching(true);
      const activeCount = await fetchJobs();
      setFetching(false);
      if (cancelled) return;
      if (activeCount && activeCount > 0) {
        pollRef.current = setTimeout(poll, 5000);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-start polling when new running jobs appear
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === "running" || j.status === "queued");
    if (!hasRunning) {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [jobs]);

  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const done = jobs.filter((j) => j.status === "succeeded" || j.status === "cancelled");
  const failed = jobs.filter((j) => j.status === "failed");

  return (
    <div className="agents-page page-view content-page">
      <div className="page-heading">
        <div><span className="eyebrow">Agents</span><h1>Pipeline jobs.</h1></div>
        <p>Trigger and monitor Mitchell ingest pipelines from here.</p>
      </div>

      {!fetching && jobs.length === 0 && (
        <p className="agents-empty">No agent jobs yet. Trigger a pipeline below.</p>
      )}

      {(fetching && jobs.length === 0) && (
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
    </div>
  );
}
