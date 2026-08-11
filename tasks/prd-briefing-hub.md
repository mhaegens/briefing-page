# PRD: Briefing Hub - Stage 1

## Introduction / Overview

The Briefing Hub is a personal web application that gives AI agents and automated tools one consistent way to communicate with the user. Agents publish structured JSON briefings via an HTTP API or by dropping files into an inbox folder. The Hub validates, stores, and presents briefings as ordered card stacks. The user reviews one card at a time, makes decisions, and explicitly marks briefings as done. Completion triggers a cascading purge: the JSON content, attachments, and cached copies are deleted. Only a minimal tombstone remains. The result is a personal, focused inbox that leaves no permanent archive.

This PRD covers Stage 1: the complete ingest-to-purge flow, deployed as a self-hosted Docker container on Coolify.

**Stack changes from the existing prototype:**

The existing codebase is built on `vinext` (a Cloudflare Workers / Next.js hybrid). That stack is replaced for Coolify self-hosting:

| What changes | From | To | Why |
|---|---|---|---|
| Build toolchain | `vinext` + `wrangler` | Standard Next.js + `next build` | Coolify runs standard Node containers |
| API layer | Cloudflare Worker (`worker/index.ts`) | Next.js API routes (`app/api/`) | Single container, no Cloudflare dependency |
| Database | Cloudflare D1 (via `cloudflare:workers` env) | SQLite via `better-sqlite3` + Drizzle | Local file, works in any Node container |
| Dev tooling | `wrangler dev` | `next dev` | Standard Next.js workflow |

**What is kept unchanged:**
- `app/page.tsx` - the complete UI (ported, not rewritten; only hardcoded data is replaced with API calls)
- `app/globals.css` - the full visual system
- `app/layout.tsx` - metadata and no-index policy

---

## Goals

- Accept structured JSON briefings from any agent via HTTP POST or file drop
- Present briefings as ordered card stacks in the existing UI
- Let the user review, triage, and act on cards one at a time
- Support explicit briefing completion with cascading purge of content
- Persist minimal lifecycle state (status, timestamps, chosen actions) after purge
- Deploy as a single Docker container on Coolify with a `/data` volume
- Allow agents to publish from anywhere over the internet (API key auth)
- Allow user to access the UI from anywhere without VPN

---

## User Stories

### US-001: Define the JSON briefing schema
**Description:** As a developer, I need a documented JSON schema for briefings so agents know exactly what to POST and the server can validate incoming data.

**Acceptance Criteria:**
- [ ] JSON Schema file exists at `src/schema/briefing.schema.json`
- [ ] Schema validates: `title`, `source.name`, `source.mark`, `source.tone`, and `cards[]`
- [ ] Each card validates: `type` (action|information|warning|result), `priority` (critical|high|medium|low), `title`, `summary`, `body` (string array), `meta`
- [ ] Each card allows optional: `action_label`, `reference`
- [ ] A sample valid briefing JSON exists at `examples/sample-briefing.json`
- [ ] Typecheck passes

### US-002: Define the database schema
**Description:** As a developer, I need Drizzle table definitions for briefings, cards, and agent sources so the app has a durable data layer.

**Acceptance Criteria:**
- [ ] `db/schema.ts` defines `briefings` table: `id`, `slug` (unique, CSPRNG), `title`, `source_name`, `source_mark`, `source_tone`, `status` (unread|in_progress|reviewed|completed|deleted), `json_path`, `created_at`, `reviewed_at`, `completed_at`
- [ ] `db/schema.ts` defines `cards` table: `id`, `briefing_id` (FK), `position`, `type`, `priority`, `title`, `summary`, `body` (JSON), `meta`, `action_label`, `reference`, `status` (unread|reviewed|actioned), `action_choice`, `reviewed_at`
- [ ] `db/schema.ts` defines `agent_sources` table: `id`, `name` (unique), `mark`, `tone`, `last_briefing_at`, `briefings_this_week`, `unread_count`
- [ ] Migration runs without error
- [ ] Typecheck passes

### US-003: Remove Cloudflare-specific code and switch to standard Next.js
**Description:** As a developer, I need the project to run as a standard Node.js Next.js app so it can be containerized and deployed on Coolify.

**Acceptance Criteria:**
- [ ] `package.json` scripts use `next dev`, `next build`, `next start` instead of `vinext`
- [ ] `vinext`, `wrangler`, `@cloudflare/vite-plugin`, `wrangler` removed from dependencies
- [ ] `worker/index.ts` deleted
- [ ] `db/index.ts` rewritten to use `better-sqlite3` (no `cloudflare:workers` import)
- [ ] `.openai/hosting.json` deleted
- [ ] `next dev` starts the app without errors
- [ ] `next build && next start` runs without errors

### US-004: Database initialization and connection
**Description:** As a developer, I need the SQLite database to auto-initialize on first run so no manual setup is required.

**Acceptance Criteria:**
- [ ] `db/index.ts` exports a `getDb()` function using `better-sqlite3` + Drizzle
- [ ] Database file is created at `/data/briefings.db` (or `./data/briefings.db` in dev)
- [ ] On first run, all tables are created if they do not exist (via Drizzle migrations or `create if not exists`)
- [ ] `DATA_DIR` environment variable controls the data root (defaults to `./data`)
- [ ] Typecheck passes

### US-005: Ingest API endpoint
**Description:** As an agent, I want to POST a briefing JSON to the server so it appears in the user's inbox.

**Acceptance Criteria:**
- [ ] `POST /api/ingest` accepts JSON matching the briefing schema
- [ ] Endpoint validates the payload against `briefing.schema.json`; returns 400 with details on validation failure
- [ ] Endpoint requires `Authorization: Bearer <API_KEY>` header; returns 401 if missing or wrong
- [ ] `API_KEY` is read from the `BRIEFING_HUB_API_KEY` environment variable
- [ ] On success: writes the JSON to `/data/briefings/<slug>.json`, inserts rows in `briefings` and `cards` tables, upserts `agent_sources`
- [ ] Slug is a CSPRNG string of at least 12 URL-safe characters
- [ ] Returns `{ "ok": true, "slug": "<slug>", "card_count": N }`
- [ ] Returns 500 with no sensitive detail on unexpected errors
- [ ] Typecheck passes

### US-006: File system inbox watcher
**Description:** As a developer, I want to drop a JSON file into `/data/inbox/` and have it ingested automatically so I can test without making HTTP requests.

**Acceptance Criteria:**
- [ ] `src/lib/inbox-watcher.ts` watches `/data/inbox/` for new `.json` files
- [ ] On new file: validates against schema, ingests (same logic as US-005 but no API key required), moves file to `/data/processed/` on success or `/data/failed/` on error
- [ ] Watcher starts when the Next.js server starts, using `instrumentation.ts`
- [ ] Watcher logs success/failure to stdout
- [ ] Typecheck passes

### US-007: List briefings API
**Description:** As the frontend, I need to fetch the list of briefings for the inbox view.

**Acceptance Criteria:**
- [ ] `GET /api/briefings` returns briefings ordered by `created_at DESC`
- [ ] Response shape: `{ briefings: [{ slug, title, source: {name, mark, tone}, status, card_count, unread_count, created_at }] }`
- [ ] Excludes briefings with status `deleted`
- [ ] Includes briefings with status `completed` (for history view filtering)
- [ ] Returns empty array if no briefings exist
- [ ] Typecheck passes

### US-008: Get single briefing API
**Description:** As the frontend, I need to fetch a briefing and all its cards for the briefing session view.

**Acceptance Criteria:**
- [ ] `GET /api/briefings/:slug` returns the briefing and its cards ordered by `position`
- [ ] Response shape: `{ slug, title, source, status, cards: [{id, position, type, priority, title, summary, body, meta, action_label, reference, status, action_choice}], created_at }`
- [ ] Returns 404 if slug not found or briefing is deleted
- [ ] Accessing an `unread` briefing automatically sets status to `in_progress`
- [ ] Typecheck passes

### US-009: Card review and action API
**Description:** As the frontend, I need to record the user's decision on each card so the server tracks review state.

**Acceptance Criteria:**
- [ ] `PATCH /api/cards/:id` accepts `{ "status": "reviewed" }` or `{ "status": "actioned", "action_choice": "<string>" }`
- [ ] Updates the card's `status`, `action_choice`, and `reviewed_at`
- [ ] Returns `{ "ok": true }`
- [ ] Returns 404 if card ID not found
- [ ] Returns 400 if status value is invalid
- [ ] Typecheck passes

### US-010: Briefing completion API with cascading purge
**Description:** As the frontend, I need to mark a briefing as done and trigger deletion of all content so the briefing is permanently closed.

**Acceptance Criteria:**
- [ ] `POST /api/briefings/:slug/complete` triggers the purge sequence
- [ ] Purge sequence: delete `/data/briefings/<slug>.json`, set cards' `body`/`summary`/`title` to null in DB, set briefing `status` to `deleted`, set `completed_at`
- [ ] Response only sent after all purge steps complete: `{ "ok": true, "actions_count": N }` where N is the number of cards with `status: actioned`
- [ ] If JSON file is already missing, purge proceeds (idempotent)
- [ ] Returns 404 if slug not found
- [ ] Tombstone retained: briefing row stays in DB with `status: deleted`, `completed_at`, and no content
- [ ] Typecheck passes

### US-011: Health check endpoint
**Description:** As Coolify, I need a health check endpoint so the container's readiness can be verified.

**Acceptance Criteria:**
- [ ] `GET /api/health` returns `{ "ok": true, "db": "connected" }` with status 200 when the database is reachable
- [ ] Returns `{ "ok": false, "db": "error" }` with status 503 if the database is not reachable
- [ ] Typecheck passes

### US-012: Wire inbox view to real data
**Description:** As the user, I want the inbox to show my actual briefings instead of hardcoded mock data.

**Acceptance Criteria:**
- [ ] `InboxView` fetches from `GET /api/briefings` on mount
- [ ] Hero callout shows the real count of unread/in-progress briefings requiring action
- [ ] Briefing list renders real briefings sorted by `created_at`
- [ ] Date in the greeting ("Good morning") is dynamic using the real current date
- [ ] "Interactive prototype" pill is removed from the topbar
- [ ] Loading state shown while data is fetching
- [ ] Empty state shown if no active briefings
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-013: Wire briefing session to real data
**Description:** As the user, I want the briefing session to show real cards from a selected briefing and record my decisions.

**Acceptance Criteria:**
- [ ] `BriefingView` accepts a `slug` prop and fetches the briefing from `GET /api/briefings/:slug`
- [ ] Cards are rendered from API data (not hardcoded array)
- [ ] Swiping left / clicking "Reviewed" calls `PATCH /api/cards/:id` with `status: reviewed`
- [ ] Swiping right / clicking "Needs action" and choosing an option calls `PATCH /api/cards/:id` with `status: actioned` and the chosen label
- [ ] Session progress and card count are driven by the real card list
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-014: Wire completion to real purge API
**Description:** As the user, I want "Mark done & delete" to actually purge the briefing so the security guarantee is real.

**Acceptance Criteria:**
- [ ] "Mark done & delete" button calls `POST /api/briefings/:slug/complete`
- [ ] Success screen is only shown after the API responds with `{ ok: true }`
- [ ] If the API returns an error, an error message is shown and the briefing is not marked deleted in the UI
- [ ] "The old briefing link no longer opens" is true: a 404 is returned on `GET /api/briefings/:slug` after completion
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-015: Wire history view to real data
**Description:** As the user, I want the history view to show my real briefing history.

**Acceptance Criteria:**
- [ ] `HistoryView` fetches from `GET /api/briefings` on mount
- [ ] Shows all briefings (active and completed)
- [ ] Filter buttons (All / Active / Completed / Needs action) filter the list client-side
- [ ] Each row shows correct status: "Reviewed - content active" or "Completed - content deleted"
- [ ] Completed rows do not link to the briefing (no arrow button, or disabled)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-016: Wire sources view to real data
**Description:** As the user, I want the sources view to show the agents that have published briefings.

**Acceptance Criteria:**
- [ ] `SourcesView` fetches agent source data from `GET /api/sources` (new endpoint)
- [ ] `GET /api/sources` returns all rows from `agent_sources` ordered by `last_briefing_at DESC`
- [ ] Each source card shows: name, mark, tone, last briefing time, unread count, briefings this week
- [ ] If no sources exist, a "No agents have published yet" empty state is shown
- [ ] Stage 2 preview card ("Agent work queue") remains as a static UI element
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-017: Docker packaging
**Description:** As a Coolify operator, I need a Dockerfile and docker-compose.yml so the app can be deployed as a container.

**Acceptance Criteria:**
- [ ] `Dockerfile` uses multi-stage build: install/build in one stage, run in another
- [ ] Final image runs `next start` on port 3000
- [ ] `BRIEFING_HUB_API_KEY` and `DATA_DIR` are accepted as environment variables
- [ ] `/data` is declared as a Docker volume mount point
- [ ] `docker-compose.yml` defines the service with the volume and env vars stubbed
- [ ] `docker build` succeeds without errors
- [ ] Container starts and `GET /api/health` returns 200

---

## Functional Requirements

- FR-1: The server must validate all incoming briefing JSON against the JSON Schema before ingestion
- FR-2: The `POST /api/ingest` endpoint must require a `Bearer` token matching `BRIEFING_HUB_API_KEY`
- FR-3: Each briefing must be assigned a CSPRNG slug of at least 12 URL-safe characters at ingest time
- FR-4: Briefing JSON files must be stored at `<DATA_DIR>/briefings/<slug>.json` and never modified after write
- FR-5: The cascading purge triggered by `POST /api/briefings/:slug/complete` must delete the JSON file and null the card body content before returning success
- FR-6: After purge, `GET /api/briefings/:slug` must return 404
- FR-7: Agent source rows must be upserted (not duplicated) on each new briefing from the same source
- FR-8: The file system watcher must move processed inbox files to avoid re-ingestion
- FR-9: The Next.js server must expose `GET /api/health` for container health checks
- FR-10: The greeting date on the inbox view must reflect the real current date

---

## Non-Goals (Out of Scope - Stage 1)

- No user-facing authentication or login screen (security is handled at the reverse proxy layer)
- No agent polling for user decisions (Stage 2)
- No decision queue or agent work queue (Stage 2)
- No push notifications or browser notifications
- No search functionality (search UI is present but not wired)
- No attachment file handling (the `reference` field is display text only)
- No briefing combining (each briefing is from one source in Stage 1)
- No multi-user support
- No admin interface
- No email or calendar integration

---

## Design Considerations

The existing `app/page.tsx` and `app/globals.css` are the design source of truth. Do not change the visual language, layout, colors, or interaction patterns. The only UI changes permitted in Stage 1 are:

1. Remove the "Interactive prototype" pill from the topbar (`topbar-actions` section in `page.tsx`)
2. Replace the static `cards` array with API-fetched data
3. Replace the static date string with `new Date().toLocaleDateString()`
4. Replace static history / sources arrays with API-fetched data

All other UI work is wiring, not redesign.

The `actionChoices` array (the four action options: Draft a response, Add to demo prep, Remind me later, I'll handle it) stays hardcoded for Stage 1. Stage 2 will allow agents to supply custom action options per briefing.

---

## Technical Considerations

**File structure (new and changed):**
```
src/
  lib/
    db.ts              -- getDb() with better-sqlite3
    ingest.ts          -- shared ingest logic (used by API and watcher)
    inbox-watcher.ts   -- fs.watch() on DATA_DIR/inbox/
    slug.ts            -- CSPRNG slug generator
  schema/
    briefing.schema.json
app/
  api/
    ingest/route.ts
    briefings/route.ts
    briefings/[slug]/route.ts
    briefings/[slug]/complete/route.ts
    cards/[id]/route.ts
    sources/route.ts
    health/route.ts
  instrumentation.ts   -- starts the inbox watcher on server init
db/
  schema.ts            -- Drizzle table definitions (replace empty placeholder)
  index.ts             -- getDb() with better-sqlite3 (replace Cloudflare version)
Dockerfile
docker-compose.yml
```

**Stage 2 extensibility (no big rework needed):**
The card `action_choice` field already captures what the user chose. Stage 2 adds:
- `GET /api/briefings/:slug/decisions` - agents poll for user decisions on their briefings
- Authenticated publishing already works (API key in place)
- No changes to existing routes needed; Stage 2 is additive

**Environment variables:**
- `BRIEFING_HUB_API_KEY` - required for ingest endpoint (40+ char random string)
- `DATA_DIR` - root for all file storage (default: `./data`)
- `NODE_ENV` - standard Next.js

**Security model (no auth in app code):**
- Publishing API: Bearer token (`BRIEFING_HUB_API_KEY`). Agents include `Authorization: Bearer <key>`.
- UI access: No auth in the app itself. Recommend Cloudflare Access (Zero Trust, free tier) on the domain as the network-layer gate. Coolify's reverse proxy (Traefik) terminates TLS; Cloudflare Access sits in front and requires Google/email auth before serving the app. Zero code changes. Works from any device, any network, no VPN needed.
- Defense in depth: cryptic slugs, no-index meta tag (already in `layout.tsx`), content purge on completion.

**SQLite in Docker:** `better-sqlite3` requires native bindings. The Dockerfile must include the node-gyp build dependencies or use a pre-built binary. Use the `node:22-slim` base with `build-essential` in the build stage.

---

## Success Metrics

- Drop a JSON file in `/data/inbox/` and it appears in the inbox within 5 seconds
- POST to `/api/ingest` from a remote agent (with API key) and the briefing appears in the UI
- Review all cards and complete a briefing: `GET /api/briefings/:slug` returns 404 and the JSON file is gone
- `docker build && docker run` produces a working container with no manual database setup
- UI is accessible at the public URL from a mobile browser with no VPN

---

## Open Questions

- What domain will this be hosted at? (The v3 doc mentioned `brief.haegens.be` - confirm if that is still the target, or if a different subdomain is preferred.)
- Should the `briefings_this_week` counter in `agent_sources` be computed on read (COUNT query) or maintained as a denormalized column? Computed is always accurate; denormalized is simpler.
- For the inbox watcher, should failed JSON files be retained in `/data/failed/` indefinitely, or auto-deleted after N days?
