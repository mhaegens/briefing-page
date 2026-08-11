# Briefing Hub

A personal inbox for AI agents. Agents publish structured JSON briefings via HTTP. You review them card-by-card, make decisions, and explicitly close each briefing — which permanently purges its content. Only a tombstone remains.

Built on Next.js 15 + SQLite (`better-sqlite3` + Drizzle ORM). Self-hosted on Coolify.

---

## How it works

1. An agent POSTs a structured JSON briefing to `/api/ingest` with a Bearer token
2. The briefing appears in the inbox as an ordered stack of cards
3. You swipe through each card: "Reviewed" or "Needs action" (pick a follow-up)
4. When done, "Mark done & delete" triggers a cascading purge: the JSON file is deleted, card content is nulled in the DB, only a tombstone row remains
5. `GET /api/briefings/:slug` returns 404 after purge

Alternatively, drop a `.json` file into `/data/inbox/` and it is ingested automatically without an API key.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, standalone output) |
| Database | SQLite via `better-sqlite3` + Drizzle ORM |
| Validation | AJV (JSON Schema Draft-07) |
| Container | Docker multi-stage, `node:22-slim` |
| Hosting | Coolify (self-hosted) |
| UI auth | Cloudflare Access (Zero Trust, network layer) |
| Agent auth | Bearer token (`BRIEFING_HUB_API_KEY`) |

---

## Local development

```bash
cp .env.example .env
# Set BRIEFING_HUB_API_KEY in .env

npm install
npm run dev
```

App runs at `http://localhost:3000`. SQLite and file storage are created at `./data/` on first start.

To test ingestion without HTTP, drop a valid JSON file into `./data/inbox/`. A sample is at `examples/sample-briefing.json`.

---

## Briefing JSON format

```json
{
  "title": "Weekly demo pipeline summary",
  "source": {
    "name": "Demo Builder",
    "mark": "DB",
    "tone": "operational"
  },
  "cards": [
    {
      "type": "action",
      "priority": "high",
      "title": "Review DSM Firmenich demo plan",
      "summary": "Three slides need updated screenshots before Thursday.",
      "body": ["Slide 4 shows old POD layout.", "Slide 7 references deprecated NC codes."],
      "meta": "Demo Builder · 3 items",
      "action_label": "Open demo plan",
      "reference": "DSM-demo-v2.pptx"
    }
  ]
}
```

Card `type`: `action` | `information` | `warning` | `result`
Card `priority`: `critical` | `high` | `medium` | `low`

Full schema: `src/schema/briefing.schema.json`

---

## API

### Publish a briefing (agent-facing)

```
POST /api/ingest
Authorization: Bearer <BRIEFING_HUB_API_KEY>
Content-Type: application/json
```

Returns `{ ok: true, slug: "abc123", card_count: 3 }` on success.

### All endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check: `{ ok: true, db: "connected" }` |
| `GET` | `/api/briefings` | List all non-deleted briefings |
| `GET` | `/api/briefings/:slug` | Get briefing + cards (auto-advances unread to in_progress) |
| `POST` | `/api/briefings/:slug/complete` | Cascading purge; slug returns 404 afterward |
| `PATCH` | `/api/cards/:id` | Record card decision: `{ status, action_choice? }` |
| `GET` | `/api/sources` | List agent sources ordered by last activity |

---

## Deployment (Coolify)

### Prerequisites

- Coolify instance with Docker support
- Domain pointed at your server (e.g. `brief.haegens.be`)
- Cloudflare Access configured on the domain (recommended)

### Steps

1. In Coolify, create a new **Application** from a Git repository
2. Repo: `https://github.com/mhaegens/briefing-page`, branch `ralph/briefing-hub-stage-1`
3. Build pack: **Dockerfile**
4. Port: `3000`
5. Persistent volume: container path `/data`
6. Environment variables:

   | Variable | Value |
   |---|---|
   | `BRIEFING_HUB_API_KEY` | Random 40+ char string (`openssl rand -hex 20`) |
   | `DATA_DIR` | `/data` |
   | `HOSTNAME` | `0.0.0.0` |
   | `PORT` | `3000` |

7. Health check path: `/api/health`
8. Deploy

### Cloudflare Access (UI auth without VPN)

1. In Cloudflare Zero Trust, create an **Application** for `brief.haegens.be`
2. Set policy to require your identity (email, GitHub, or Google)
3. Add a **bypass rule** so agents can POST without interactive auth:
   - Path: `brief.haegens.be/api/*` — Action: Bypass

The UI at `brief.haegens.be` requires login. Agents hitting `/api/ingest` are gated only by the Bearer token.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BRIEFING_HUB_API_KEY` | Yes | — | Bearer token for `/api/ingest`. Min 40 chars. |
| `DATA_DIR` | No | `./data` | Root for SQLite DB and briefing JSON files |
| `HOSTNAME` | No | `localhost` | Set to `0.0.0.0` in Docker so the port binds on all interfaces |
| `PORT` | No | `3000` | HTTP port |

---

## Data layout

```
/data/
  briefings.db          # SQLite database
  briefings/            # Immutable JSON files; deleted on purge
  inbox/                # Drop files here for auto-ingest
  processed/            # Moved here after successful ingest
  failed/               # Moved here on validation/ingest error
```

---

## Stage 2 (planned)

Agents polling for user decisions. The `action_choice` column is already populated by Stage 1. Stage 2 adds `GET /api/briefings/:slug/decisions` — no changes to existing routes needed.
