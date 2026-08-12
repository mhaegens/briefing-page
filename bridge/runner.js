import { run as runPlaud } from "./pipelines/plaud.js";

const PIPELINES = {
  plaud: runPlaud,
};

export async function runJob(job, config) {
  const pipeline = PIPELINES[job.job_type];
  if (!pipeline) {
    console.error(`[runner] unknown job_type: ${job.job_type}`);
    await fetch(`${config.HUB_URL}/api/bridge/jobs/${job.id}/fail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.BRIDGE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error_message: `Unknown job_type: ${job.job_type}` }),
    }).catch(console.error);
    return;
  }

  try {
    await pipeline(job, config);
  } catch (err) {
    console.error(`[runner] unhandled error in ${job.job_type}:`, err);
    await fetch(`${config.HUB_URL}/api/bridge/jobs/${job.id}/fail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.BRIDGE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error_message: err.message ?? String(err) }),
    }).catch(console.error);
  }
}
