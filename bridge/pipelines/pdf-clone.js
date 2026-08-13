import { runPipeline } from "./_base.js";
import { bridgeHeaders } from "../config.js";

export async function run(job, config) {
  const input = job.input_json ? JSON.parse(job.input_json) : {};
  if (!input.path) {
    await fetch(`${config.HUB_URL}/api/bridge/jobs/${job.id}/fail`, {
      method: "POST",
      headers: bridgeHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ error_message: "pdf-clone requires input.path" }),
    });
    return;
  }
  await runPipeline(job, config, {
    promptFile: "_Ingest/PDF-CLONE.md",
    extraPrefix: `Target path: ${input.path}`,
  });
}
