import Ajv from "ajv";
import * as fs from "fs";
import * as path from "path";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { briefings, cards, agent_sources } from "@/db/schema";
import { generateSlug } from "./slug";
import schema from "@/src/schema/briefing.schema.json";

const DATA_DIR = process.env.DATA_DIR ?? "./data";

const ajv = new Ajv();
const validate = ajv.compile(schema);

export interface BriefingPayload {
  title: string;
  source: { name: string; mark: string; tone: string };
  cards: Array<{
    type: "action" | "information" | "warning" | "result";
    priority: "critical" | "high" | "medium" | "low";
    title: string;
    summary: string;
    body: string[];
    meta: string;
    action_label?: string;
    reference?: string;
    action_job_type?: string;
    action_job_title?: string;
    action_job_input?: string;
  }>;
}

export async function ingestBriefing(
  payload: unknown
): Promise<{ slug: string; cardCount: number }> {
  if (!validate(payload)) {
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join(", ");
    throw new Error(`Validation failed: ${errors}`);
  }

  const data = payload as unknown as BriefingPayload;
  const db = getDb();
  const slug = generateSlug();
  const jsonPath = path.join(DATA_DIR, "briefings", `${slug}.json`);

  // Write immutable JSON file
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");

  // Insert briefing row
  const [briefing] = db
    .insert(briefings)
    .values({
      slug,
      title: data.title,
      source_name: data.source.name,
      source_mark: data.source.mark,
      source_tone: data.source.tone,
      json_path: jsonPath,
    })
    .returning({ id: briefings.id })
    .all();

  // Insert card rows
  for (let i = 0; i < data.cards.length; i++) {
    const card = data.cards[i];
    db.insert(cards)
      .values({
        briefing_id: briefing.id,
        position: i,
        type: card.type,
        priority: card.priority,
        title: card.title,
        summary: card.summary,
        body: JSON.stringify(card.body),
        meta: card.meta,
        action_label: card.action_label ?? null,
        reference: card.reference ?? null,
        action_job_type: card.action_job_type ?? null,
        action_job_title: card.action_job_title ?? null,
        action_job_input: card.action_job_input ?? null,
      })
      .run();
  }

  // Upsert agent source — increment counters on conflict
  db.insert(agent_sources)
    .values({
      name: data.source.name,
      mark: data.source.mark,
      tone: data.source.tone,
      last_briefing_at: new Date(),
      briefings_this_week: 1,
      unread_count: 1,
    })
    .onConflictDoUpdate({
      target: agent_sources.name,
      set: {
        mark: data.source.mark,
        tone: data.source.tone,
        last_briefing_at: new Date(),
        briefings_this_week: sql`${agent_sources.briefings_this_week} + 1`,
        unread_count: sql`${agent_sources.unread_count} + 1`,
      },
    })
    .run();

  return { slug, cardCount: data.cards.length };
}
