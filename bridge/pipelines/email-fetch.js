import { runPipeline } from "./_base.js";

export async function run(job, config) {
  await runPipeline(job, config, { promptFile: "_Ingest/EMAIL-FETCH.md" });
}
