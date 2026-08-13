import { runPipeline } from "./_base.js";

export async function run(job, config) {
  const input = job.input_json ? JSON.parse(job.input_json) : {};
  const extraPrefix = input.path ? `Target path: ${input.path}` : "";
  await runPipeline(job, config, { promptFile: "_Ingest/DEEPEN.md", extraPrefix });
}
