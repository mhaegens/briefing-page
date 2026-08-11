import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const briefings = sqliteTable("briefings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  source_name: text("source_name").notNull(),
  source_mark: text("source_mark").notNull(),
  source_tone: text("source_tone").notNull(),
  status: text("status", {
    enum: ["unread", "in_progress", "reviewed", "completed", "deleted"],
  })
    .notNull()
    .default("unread"),
  json_path: text("json_path"),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  reviewed_at: integer("reviewed_at", { mode: "timestamp" }),
  completed_at: integer("completed_at", { mode: "timestamp" }),
});

export const cards = sqliteTable("cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  briefing_id: integer("briefing_id")
    .notNull()
    .references(() => briefings.id),
  position: integer("position").notNull(),
  type: text("type", {
    enum: ["action", "information", "warning", "result"],
  }).notNull(),
  priority: text("priority", {
    enum: ["critical", "high", "medium", "low"],
  }).notNull(),
  title: text("title"),
  summary: text("summary"),
  body: text("body"),
  meta: text("meta"),
  action_label: text("action_label"),
  reference: text("reference"),
  status: text("status", {
    enum: ["unread", "reviewed", "actioned"],
  })
    .notNull()
    .default("unread"),
  action_choice: text("action_choice"),
  reviewed_at: integer("reviewed_at", { mode: "timestamp" }),
});

export const agent_sources = sqliteTable("agent_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  mark: text("mark").notNull(),
  tone: text("tone").notNull(),
  last_briefing_at: integer("last_briefing_at", { mode: "timestamp" }),
  briefings_this_week: integer("briefings_this_week").notNull().default(0),
  unread_count: integer("unread_count").notNull().default(0),
});
