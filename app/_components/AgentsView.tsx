"use client";

import { useState } from "react";

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

export default function AgentsView({ onJobsChange }: { onJobsChange?: (activeCount: number) => void }) {
  const [jobs] = useState<Job[]>([]);

  return (
    <div className="agents-page page-view content-page">
      <div className="page-heading">
        <div><span className="eyebrow">Agents</span><h1>Pipeline jobs.</h1></div>
        <p>Trigger and monitor Mitchell ingest pipelines from here.</p>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "12px" }}>Coming soon — job list and trigger panel.</p>
    </div>
  );
}
