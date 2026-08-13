import * as fs from "fs";
import * as path from "path";
import { ingestBriefing } from "./ingest";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const INBOX_DIR = path.join(DATA_DIR, "inbox");

async function processFile(filename: string) {
  if (!filename.endsWith(".json")) return;
  const src = path.join(INBOX_DIR, filename);

  // Small delay so the file is fully written before we read it
  await new Promise((r) => setTimeout(r, 200));

  let raw: string;
  try {
    raw = fs.readFileSync(src, "utf-8");
  } catch {
    return; // File already deleted
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    console.error(`[inbox-watcher] invalid JSON in ${filename}:`, err);
    try { fs.unlinkSync(src); } catch { /* already gone */ }
    return;
  }

  try {
    const result = await ingestBriefing(payload);
    console.log(`[inbox-watcher] ingested ${filename} → slug=${result.slug} cards=${result.cardCount}`);
    try { fs.unlinkSync(src); } catch { /* already gone */ }
  } catch (err) {
    console.error(`[inbox-watcher] failed to ingest ${filename}:`, err);
    try { fs.unlinkSync(src); } catch { /* already gone */ }
  }
}

export function startInboxWatcher() {
  fs.mkdirSync(INBOX_DIR, { recursive: true });

  console.log(`[inbox-watcher] watching ${INBOX_DIR}`);

  fs.watch(INBOX_DIR, (_event, filename) => {
    if (filename) processFile(filename).catch(console.error);
  });
}
