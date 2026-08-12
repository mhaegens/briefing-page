import config, { validateConfig } from "./config.js";

const errors = validateConfig(config);
if (errors.length > 0) {
  for (const err of errors) {
    process.stderr.write(`[bridge] config error: ${err}\n`);
  }
  process.exit(1);
}

console.log(`Bridge ready. Polling ${config.HUB_URL} for jobs. Ctrl-C to stop.`);
