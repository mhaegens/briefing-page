import { runPipeline } from "./_base.js";

const AUTO_PREFIX =
  "Run in fully automatic mode. At the Phase 1 review gate, approve all new recordings automatically — do not pause for user input. Proceed through all phases without stopping.";

export async function run(job, config) {
  await runPipeline(job, config, { promptFile: "_Ingest/PLAUD.md", extraPrefix: AUTO_PREFIX });
}
