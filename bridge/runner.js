export async function runJob(job, config) {
  console.error(`[runner] unknown job_type: ${job.job_type}`);
  await fetch(`${config.HUB_URL}/api/bridge/jobs/${job.id}/fail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.BRIDGE_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ error_message: `Unknown job_type: ${job.job_type}` }),
  }).catch(console.error);
}
