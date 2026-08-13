/**
 * Stub pipeline for test use only.
 * Sleeps 200ms, posts progress at ~50%, then completes successfully.
 */

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function run(job, config) {
  const base = `${config.HUB_URL}/api/bridge/jobs/${job.id}`;
  const headers = {
    Authorization: `Bearer ${config.BRIDGE_SECRET}`,
    "Content-Type": "application/json",
  };

  await sleep(100);

  await fetch(`${base}/progress`, {
    method: "POST",
    headers,
    body: JSON.stringify({ pct: 50, label: "Stub pipeline running…" }),
  }).catch(() => {});

  await sleep(100);

  await fetch(`${base}/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
}
