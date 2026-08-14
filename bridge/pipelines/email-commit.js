import { runPipeline } from "./_base.js";

export async function run(job, config) {
  const extraPrefix = job.input?.path
    ? `Batch file: ${job.input.path}\n\n`
    : "";
  await runPipeline(job, config, { promptFile: "_Ingest/EMAIL-COMMIT.md", extraPrefix });
}
