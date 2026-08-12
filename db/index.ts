import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as schema from "./schema";

const DATA_DIR = process.env.DATA_DIR ?? "./data";

function ensureDirs() {
  for (const dir of ["", "briefings", "inbox"]) {
    fs.mkdirSync(path.join(DATA_DIR, dir), { recursive: true });
  }
}

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: InstanceType<typeof Database> | null = null;

export function getDb() {
  if (_db) return _db;

  ensureDirs();

  const sqlite = new Database(path.join(DATA_DIR, "briefings.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_mark TEXT NOT NULL,
      source_tone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread',
      json_path TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      reviewed_at INTEGER,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      briefing_id INTEGER NOT NULL REFERENCES briefings(id),
      position INTEGER NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      body TEXT,
      content TEXT,
      meta TEXT,
      action_label TEXT,
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'unread',
      action_choice TEXT,
      reviewed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      mark TEXT NOT NULL,
      tone TEXT NOT NULL,
      last_briefing_at INTEGER,
      briefings_this_week INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Lightweight forward migration for databases created before rich content blocks.
  const cardColumns = sqlite.pragma("table_info(cards)") as Array<{ name: string }>;
  if (!cardColumns.some((column) => column.name === "content")) {
    sqlite.exec("ALTER TABLE cards ADD COLUMN content TEXT");
  }

  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });
  return _db;
}

export function getSqlite(): InstanceType<typeof Database> {
  if (!_sqlite) getDb();
  return _sqlite!;
}
