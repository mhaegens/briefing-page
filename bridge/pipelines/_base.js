import { spawn } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { bridgeHeaders } from "../config.js";

export async function runPipeline(job, config, { promptFile, extraPrefix = "" }) {
  const promptPath = join(config.VAULT_ROOT, promptFile);
  let promptContent;
  try {
    promptContent = readFileSync(promptPath, "utf-8");
  } catch (err) {
    await postFail(config, job.id, `Failed to read prompt file ${promptFile}: ${err.message}`);
    return;
  }

  const stdinContent = extraPrefix ? `${extraPrefix}\n\n${promptContent}` : promptContent;

  const child = spawn(config.CLAUDE_PATH, ["--print", "--dangerously-skip-permissions"], {
    cwd: config.VAULT_ROOT,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let outputChunks = [];
  child.stdout.on("data", (chunk) => outputChunks.push(chunk));
  child.stderr.on("data", (chunk) => outputChunks.push(chunk));
  child.stdin.end(stdinContent);

  let pct = 1;
  const progressTimer = setInterval(async () => {
    pct = Math.min(95, pct + 5);
    await postProgress(config, job.id, pct, `Running ${promptFile.split("/").pop().replace(".md", "")} pipeline…`).catch(() => {});
  }, 5000);

  return new Promise((resolve) => {
    child.on("close", async (code) => {
      clearInterval(progressTimer);
      if (code === 0) {
        await postComplete(config, job.id).catch(console.error);
      } else {
        const combined = Buffer.concat(outputChunks).toString("utf-8");
        const errorMessage = combined.slice(-500);
        await postFail(config, job.id, errorMessage).catch(console.error);
      }
      resolve();
    });
  });
}

async function postProgress(config, jobId, pct, label) {
  return fetch(`${config.HUB_URL}/api/bridge/jobs/${jobId}/progress`, {
    method: "POST",
    headers: bridgeHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ pct, label }),
  });
}

async function postComplete(config, jobId, resultJson) {
  return fetch(`${config.HUB_URL}/api/bridge/jobs/${jobId}/complete`, {
    method: "POST",
    headers: bridgeHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ result_json: resultJson ?? undefined }),
  });
}

async function postFail(config, jobId, errorMessage) {
  return fetch(`${config.HUB_URL}/api/bridge/jobs/${jobId}/fail`, {
    method: "POST",
    headers: bridgeHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ error_message: errorMessage }),
  });
}
