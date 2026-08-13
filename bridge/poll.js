import { bridgeHeaders } from "./config.js";

let stopping = false;
let currentJobPromise = null;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollOnce(config) {
  const url = `${config.HUB_URL}/api/bridge/jobs/next?wait_seconds=20`;
  const res = await fetch(url, {
    headers: bridgeHeaders(config),
  });

  if (res.status === 200) {
    const data = await res.json();
    return data.job;
  }

  if (res.status === 204) {
    return null;
  }

  throw new Error(`Unexpected status ${res.status} from poll`);
}

async function claimJob(config, jobId) {
  const res = await fetch(`${config.HUB_URL}/api/bridge/jobs/${jobId}/claim`, {
    method: "POST",
    headers: bridgeHeaders(config),
  });

  if (res.status === 200) {
    const data = await res.json();
    return data.job;
  }

  if (res.status === 409) {
    return null;
  }

  throw new Error(`Unexpected status ${res.status} from claim`);
}

export async function startPolling(config, runJob) {
  let backoff = 5000;

  process.on("SIGINT", handleStop);
  process.on("SIGTERM", handleStop);

  function handleStop() {
    if (stopping) return;
    stopping = true;
    console.log("[bridge] stopping — waiting for current job to finish…");
    if (currentJobPromise) {
      const timeout = setTimeout(() => process.exit(0), 30000);
      currentJobPromise.finally(() => {
        clearTimeout(timeout);
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }

  while (!stopping) {
    try {
      const job = await pollOnce(config);

      if (!job) {
        backoff = 5000;
        continue;
      }

      const claimed = await claimJob(config, job.id);
      if (!claimed) {
        continue;
      }

      backoff = 5000;
      currentJobPromise = runJob(claimed, config);
      await currentJobPromise;
      currentJobPromise = null;
    } catch (err) {
      console.error("[bridge] poll error:", err.message ?? err);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  }
}
