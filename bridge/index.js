import config, { validateConfig } from "./config.js";
import { startPolling } from "./poll.js";
import { runJob } from "./runner.js";

const errors = validateConfig(config);
if (errors.length > 0) {
  for (const err of errors) {
    process.stderr.write(`[bridge] config error: ${err}\n`);
  }
  process.exit(1);
}

console.log(`Bridge ready. Polling ${config.HUB_URL} for jobs. Ctrl-C to stop.`);

startPolling(config, runJob).catch((err) => {
  console.error("[bridge] fatal error:", err);
  process.exit(1);
});
