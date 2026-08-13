import "dotenv/config";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function expandHome(p) {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

const HUB_URL = process.env.HUB_URL;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;
const VAULT_ROOT = process.env.VAULT_ROOT;
const CLAUDE_PATH = process.env.CLAUDE_PATH
  ? expandHome(process.env.CLAUDE_PATH)
  : expandHome("~/.local/bin/claude");
const CF_CLIENT_ID = process.env.CF_CLIENT_ID;
const CF_CLIENT_SECRET = process.env.CF_CLIENT_SECRET;

const config = {
  HUB_URL,
  BRIDGE_SECRET,
  VAULT_ROOT,
  CLAUDE_PATH,
  CF_CLIENT_ID,
  CF_CLIENT_SECRET,
};

export function bridgeHeaders(cfg, extra = {}) {
  return {
    Authorization: `Bearer ${cfg.BRIDGE_SECRET}`,
    ...(cfg.CF_CLIENT_ID && { "CF-Access-Client-Id": cfg.CF_CLIENT_ID }),
    ...(cfg.CF_CLIENT_SECRET && { "CF-Access-Client-Secret": cfg.CF_CLIENT_SECRET }),
    ...extra,
  };
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg.HUB_URL) errors.push("HUB_URL is required");
  if (!cfg.BRIDGE_SECRET) errors.push("BRIDGE_SECRET is required");
  if (!cfg.VAULT_ROOT) {
    errors.push("VAULT_ROOT is required");
  } else if (!existsSync(cfg.VAULT_ROOT)) {
    errors.push(`VAULT_ROOT directory does not exist: ${cfg.VAULT_ROOT}`);
  }
  return errors;
}

export default config;
