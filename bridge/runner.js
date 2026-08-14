import { run as runPlaud } from "./pipelines/plaud.js";
import { run as runPrompt } from "./pipelines/prompt.js";
import { run as runEmail } from "./pipelines/email.js";
import { run as runDeepen } from "./pipelines/deepen.js";
import { run as runPdfClone } from "./pipelines/pdf-clone.js";
import { run as runSapNote } from "./pipelines/sap-note.js";
import { run as runRfpResponse } from "./pipelines/rfp-response.js";
import { run as runReport } from "./pipelines/report.js";
import { run as runStub } from "./pipelines/stub.js";
import { run as runEmailFetch } from "./pipelines/email-fetch.js";
import { run as runEmailCommit } from "./pipelines/email-commit.js";

const PIPELINES = {
  plaud: runPlaud,
  prompt: runPrompt,
  email: runEmail,
  deepen: runDeepen,
  "pdf-clone": runPdfClone,
  "sap-note": runSapNote,
  "rfp-response": runRfpResponse,
  report: runReport,
  "email-fetch": runEmailFetch,
  "email-commit": runEmailCommit,
};

// Stub pipeline available only in test mode
if (process.env.NODE_ENV === "test") {
  PIPELINES["stub"] = runStub;
}

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
