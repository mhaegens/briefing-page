# PRD: Briefing Hub Stage 2 — Security Hardening + Mac Bridge + Agent Portal

## Introduction

Stage 1 shipped a fully working ingest-to-purge flow deployed at `brief.haegens.be`. A live security audit on 12 August 2026 found the UI, `/api/briefings`, and `/api/sources` publicly accessible without authentication — the app was fully open to anyone with the URL.

Stage 2 ships in three layers:

1. **Security hardening** — application-level owner authorization, security headers, input limits, CSRF controls, and storage hygiene. (Cloudflare Access configuration is a manual deployment step done by the owner separately.)
2. **Mac Bridge** — a Node.js script (`node bridge/index.js`) that polls the Hub for pipeline jobs and executes approved Mitchell ingest pipelines (PLAUD, PROMPT, EMAIL, DEEPEN, PDF-CLONE, SAP-NOTE, RFP-RESPONSE, REPORT) locally via the Claude Code CLI, then reports results back.
3. **Agent Portal** — a new "Agents" tab in the Hub UI that shows all pipeline jobs and lets the owner trigger any pipeline, with an optional file path parameter where needed.

## Goals

- All private API routes and the UI return 401 to any request without a valid Cloudflare Access owner JWT.
- Security headers, no-store caching, CSRF origin checks, and input size limits are applied consistently.
- Briefing purge removes all content from active DB columns and the source JSON file.
- A plain `node bridge/index.js` on the Mac polls for jobs and runs Mitchell pipelines via Claude Code CLI.
- The owner can trigger any of 8 pipeline types from the Hub UI with zero terminal interaction.
- Job state (queued, running, done, failed) is visible and refreshes in real time.
- `npm run typecheck && npm audit --omit=dev` pass with zero high/critical advisories after the dependency upgrade.

## User Stories

### US-101: Upgrade Next.js and React
**Description:** As a developer, I need the production dependencies patched so no critical or high CVEs remain in the production bundle.

**Acceptance Criteria:**
- [ ] `next` upgraded from 15.3.4 to ≥15.5.23 (patched release for GHSA-9qr9-h5gf-34mp)
- [ ] `react` and `react-dom` upgraded from 19.0.0 to ≥19.0.8
- [ ] `eslint-config-next` upgraded to match the new Next.js version
- [ ] `package-lock.json` regenerated
- [ ] `npm audit --omit=dev` reports zero high or critical production advisories
- [ ] `npm run build` completes without errors
- [ ] Typecheck passes

### US-102: Owner authorization middleware
**Description:** As a developer, I need a server-side auth helper that validates the Cloudflare Access JWT so every protected route has a second security layer beyond the edge.

**Acceptance Criteria:**
- [ ] `src/lib/auth.ts` exports `requireOwner(request: Request): Promise<void>`
- [ ] Reads JWT from `Cf-Access-Jwt-Assertion` header
- [ ] Fetches Cloudflare JWKS from `https://<CLOUDFLARE_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs` and validates JWT signature
- [ ] Verifies `aud` claim equals `CLOUDFLARE_ACCESS_AUDIENCE` env var
- [ ] Verifies `email` claim equals `BRIEFING_HUB_OWNER_EMAIL` env var
- [ ] Throws a `Response` with status 401 and body `{"error":"Unauthorized"}` on any validation failure
- [ ] Fails closed (throws 401) if any of the three env vars is absent, UNLESS `NODE_ENV !== 'production'` AND `DEV_SKIP_AUTH=true`
- [ ] `.env.example` updated with `BRIEFING_HUB_OWNER_EMAIL`, `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, `CLOUDFLARE_ACCESS_AUDIENCE`
- [ ] Typecheck passes

### US-103: Protect every private API route
**Description:** As the owner, I need every confidential route to enforce server-side authorization so an edge misconfiguration cannot expose briefing data.

**Acceptance Criteria:**
- [ ] `requireOwner(request)` called at the top of `GET /api/briefings`
- [ ] `requireOwner(request)` called at the top of `GET /api/briefings/[slug]`
- [ ] `requireOwner(request)` called at the top of `GET /api/sources`
- [ ] `requireOwner(request)` called at the top of `PATCH /api/cards/[id]`
- [ ] `requireOwner(request)` called at the top of `POST /api/briefings/[slug]/complete`
- [ ] Each protected route returns 401 (generic body, no route data) when auth fails
- [ ] `POST /api/ingest` is NOT changed by this story — it keeps its existing bearer token check
- [ ] Typecheck passes

### US-104: Server-rendered owner page
**Description:** As the owner, I need the main page to authorize server-side before returning any HTML so an origin-bypass attacker cannot load the UI shell.

**Acceptance Criteria:**
- [ ] `app/page.tsx` converted to a server component (`async function Page()`)
- [ ] Existing client-side UI moved to `app/_components/HubClient.tsx` with `'use client'` directive
- [ ] `requireOwner(request)` called in `app/page.tsx` before rendering `<HubClient />`
- [ ] `export const dynamic = 'force-dynamic'` set in `app/page.tsx`
- [ ] Unauthenticated request to `/` returns 401, not the UI HTML
- [ ] UI still works correctly for authenticated owner (no visual regressions)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-105: Security response headers
**Description:** As a security-conscious operator, I need confidentiality and anti-framing headers applied to every response so briefing content cannot be cached, indexed, or framed.

**Acceptance Criteria:**
- [ ] `next.config.ts` headers block applies to all paths (`source: '/(.*)'`):
  - `Cache-Control: private, no-store, max-age=0`
  - `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'`
- [ ] `X-Powered-By` header suppressed (`poweredByHeader: false` in next.config.ts)
- [ ] `public/robots.txt` created with `User-agent: *\nDisallow: /`
- [ ] Typecheck passes

### US-106: Input limits and CSRF
**Description:** As a security-conscious operator, I need payload size limits, origin validation, and timing-safe token comparison so agents cannot overwhelm the server and cross-origin mutations are rejected.

**Acceptance Criteria:**
- [ ] `POST /api/ingest`: reject if `Content-Length` header absent or > 524288 (512 KiB); return 413
- [ ] `POST /api/ingest`: bearer token comparison uses `crypto.timingSafeEqual` (constant-time)
- [ ] All mutation handlers (`PATCH /api/cards/[id]`, `POST /api/briefings/[slug]/complete`): reject if `Content-Type` is not `application/json`; return 415
- [ ] All mutation handlers: reject if `Origin` header is absent or does not equal `https://brief.haegens.be`; return 403. Skip this check when `NODE_ENV !== 'production'`
- [ ] `src/schema/briefing.schema.json`: add `maxLength: 300` to `title`, `maxLength: 500` to `summary`, `maxLength: 2000` to each `body` item, `maxLength: 100` to `meta`, `action_label`, `reference`; add `maxItems: 100` to `cards` array and `body` array
- [ ] Typecheck passes

### US-107: Purge and storage hygiene
**Description:** As a privacy-conscious owner, I need the purge operation to cover all content fields, remove processed inbox files, and use secure SQLite deletion so completed briefings leave no recoverable plaintext.

**Acceptance Criteria:**
- [ ] Completion handler adds `PRAGMA secure_delete = ON` before the purge transaction
- [ ] Tombstone nulls out: `title`, `source_name`, `source_mark`, `source_tone`, `json_path` — retains only `id`, `slug`, `status`, `created_at`, `completed_at`
- [ ] Inbox watcher: after successful ingest, deletes the source file from `/data/inbox/` (does not move to `/data/processed/`)
- [ ] Inbox watcher: on failed ingest, logs the error and deletes the source file (does not retain in `/data/failed/`)
- [ ] Typecheck passes

### US-201: Jobs and pipeline_runs DB tables
**Description:** As a developer, I need database tables to store pipeline job requests and Bridge execution records so job state persists across restarts.

**Acceptance Criteria:**
- [ ] `db/schema.ts` adds `jobs` table: `id` (integer pk autoincrement), `job_type` (text not null), `title` (text not null), `status` (text not null default 'queued', values: queued|claimed|running|succeeded|failed|cancelled), `input_json` (text), `result_json` (text), `error_message` (text), `progress_pct` (integer default 0), `progress_label` (text), `created_at` (integer not null), `claimed_at` (integer), `started_at` (integer), `finished_at` (integer)
- [ ] `db/schema.ts` adds `pipeline_runs` table: `id` (integer pk autoincrement), `job_id` (integer not null references jobs.id), `bridge_pid` (integer), `stderr_tail` (text)
- [ ] `db/index.ts` `getDb()` creates both tables on first run (CREATE TABLE IF NOT EXISTS)
- [ ] Typecheck passes

### US-202: Hub Bridge API — poll and claim
**Description:** As the Mac Bridge, I need to poll for the next queued job and atomically claim it so no two Bridge instances can run the same job.

**Acceptance Criteria:**
- [ ] `GET /api/bridge/jobs/next?wait_seconds=N` endpoint exists
- [ ] Returns 401 if `Authorization: Bearer <BRIDGE_SECRET>` is missing or wrong
- [ ] Polls the jobs table for the next `status='queued'` row for up to `wait_seconds` (max 30); returns `{ job }` with status 200 when found
- [ ] Returns 204 (empty body) if no job found within the timeout
- [ ] `POST /api/bridge/jobs/:id/claim` endpoint exists
- [ ] Atomically sets `status='claimed'` and `claimed_at=now()` using a single UPDATE WHERE status='queued'; returns 200 with the job row on success
- [ ] Returns 409 `{"error":"already claimed"}` if job is not in queued status
- [ ] Returns 401 without BRIDGE_SECRET
- [ ] `BRIDGE_SECRET` added to `.env.example`
- [ ] Typecheck passes

### US-203: Hub Bridge API — progress, complete, fail
**Description:** As the Mac Bridge, I need to report job progress and final state back to the Hub so the owner can see what is happening.

**Acceptance Criteria:**
- [ ] `POST /api/bridge/jobs/:id/progress` accepts `{ pct: number, label: string }`; updates `progress_pct` and `progress_label`; sets `status='running'` and `started_at` (if not already set); returns 200 `{ ok: true }`; requires BRIDGE_SECRET
- [ ] `POST /api/bridge/jobs/:id/complete` accepts `{ result_json?: string }`; sets `status='succeeded'`, `finished_at=now()`, stores `result_json`; returns 200 `{ ok: true }`; requires BRIDGE_SECRET
- [ ] `POST /api/bridge/jobs/:id/fail` accepts `{ error_message: string }`; sets `status='failed'`, `finished_at=now()`, stores `error_message`; returns 200 `{ ok: true }`; requires BRIDGE_SECRET
- [ ] All three return 401 without valid BRIDGE_SECRET
- [ ] All three return 404 if job id not found
- [ ] Typecheck passes

### US-204: Hub user API — create and list jobs
**Description:** As the owner, I need to create pipeline jobs from the UI and list all jobs with their current state.

**Acceptance Criteria:**
- [ ] `POST /api/jobs` requires owner auth; accepts `{ job_type: string, title: string, input?: { path?: string } }`; inserts job with `status='queued'`, `created_at=now()`; returns 201 `{ id, job_type, title, status, created_at }`
- [ ] Returns 400 if `job_type` is not one of: `plaud`, `prompt`, `email`, `deepen`, `pdf-clone`, `sap-note`, `rfp-response`, `report`
- [ ] `GET /api/jobs` requires owner auth; returns `{ jobs: [...], last_bridge_seen: number|null }` ordered by `created_at DESC`
- [ ] Each job in the list includes: `id`, `job_type`, `title`, `status`, `progress_pct`, `progress_label`, `error_message` (last 200 chars), `created_at`, `claimed_at`, `started_at`, `finished_at`
- [ ] `last_bridge_seen` is the most recent `claimed_at` timestamp across all jobs (null if no jobs have been claimed)
- [ ] Typecheck passes

### US-205: Hub user API — cancel job
**Description:** As the owner, I need to cancel a queued job before the Bridge picks it up.

**Acceptance Criteria:**
- [ ] `POST /api/jobs/:id/cancel` requires owner auth
- [ ] Sets `status='cancelled'` and `finished_at=now()` if job is currently `queued`
- [ ] Returns 200 `{ ok: true }` on success
- [ ] Returns 409 `{ error: "Job is not in a cancellable state" }` if status is not `queued`
- [ ] Returns 404 if job id not found
- [ ] Typecheck passes

### US-301: Bridge skeleton and config
**Description:** As the owner, I need a runnable Bridge script with clear startup validation so I know immediately if something is misconfigured.

**Acceptance Criteria:**
- [ ] `bridge/index.js` exists and is the entry point (`node bridge/index.js`)
- [ ] `bridge/config.js` reads from environment / `.env` file (using dotenv): `HUB_URL` (required), `BRIDGE_SECRET` (required), `VAULT_ROOT` (required, must be an existing directory), `CLAUDE_PATH` (optional, defaults to `~/.local/bin/claude`)
- [ ] On startup, validates all required values; if any missing or `VAULT_ROOT` does not exist, prints a clear error message and exits with code 1
- [ ] On successful startup, prints: `Bridge ready. Polling <HUB_URL> for jobs. Ctrl-C to stop.`
- [ ] `bridge/.env.example` exists with template values: `HUB_URL=https://brief.haegens.be`, `BRIDGE_SECRET=`, `VAULT_ROOT=/path/to/Mitchell/vault`, `CLAUDE_PATH=~/.local/bin/claude`
- [ ] `bridge/package.json` exists with `{ "type": "module" }` and `dotenv` as a dependency
- [ ] `node bridge/index.js` (with valid env) starts without error

### US-302: Bridge polling loop
**Description:** As the Mac Bridge, I need a resilient polling loop that claims and runs jobs, handling network errors with backoff.

**Acceptance Criteria:**
- [ ] `bridge/poll.js` exports `startPolling(config)` that continuously long-polls `GET <HUB_URL>/api/bridge/jobs/next?wait_seconds=20`
- [ ] On HTTP 200: immediately calls `POST /api/bridge/jobs/:id/claim`; if claim returns 200, dispatches to runner; if 409, re-polls immediately
- [ ] On HTTP 204: re-polls immediately
- [ ] On network error or non-200/204 HTTP: logs the error, waits with exponential backoff starting at 5 seconds, doubling up to 60 seconds max, then re-polls
- [ ] On SIGINT or SIGTERM: stops accepting new jobs; if a job is running, waits for it to finish (or 30 seconds), then exits cleanly
- [ ] `bridge/index.js` calls `startPolling(config)` after startup validation

### US-303: Bridge runner — PLAUD pipeline
**Description:** As the owner, I need the Bridge to run the PLAUD ingest pipeline so recordings sync automatically when I trigger it from the Hub.

**Acceptance Criteria:**
- [ ] `bridge/runner.js` exports `runJob(job, config)` that dispatches to the correct pipeline module based on `job.job_type`
- [ ] `bridge/pipelines/plaud.js` exports `run(job, config)` that:
  - Reads `_Ingest/PLAUD.md` from `config.VAULT_ROOT`
  - Spawns `config.CLAUDE_PATH` with args `['--print', '--dangerously-skip-permissions']`, `{ shell: false, cwd: config.VAULT_ROOT }`
  - Passes the prompt file content via stdin
  - Reports progress every 5 seconds by POSTing to `/api/bridge/jobs/:id/progress` with incrementing `pct` and label `"Running PLAUD pipeline…"`
  - On exit code 0: POSTs to `/api/bridge/jobs/:id/complete`
  - On non-zero exit: POSTs to `/api/bridge/jobs/:id/fail` with last 500 chars of stderr as `error_message`
- [ ] Typecheck/lint passes for bridge JS files

### US-304: Bridge runners — PROMPT, EMAIL, DEEPEN, PDF-CLONE
**Description:** As the owner, I need four more pipeline runners so I can trigger general ingestion, email processing, knowledge deepening, and PDF cloning from the Hub.

**Acceptance Criteria:**
- [ ] `bridge/pipelines/prompt.js` runs `_Ingest/PROMPT.md`; prepends `"Target path: <job.input.path>\n\n"` to stdin when `input.path` is provided
- [ ] `bridge/pipelines/email.js` runs `_Ingest/EMAIL.md`; no path input
- [ ] `bridge/pipelines/deepen.js` runs `_Ingest/DEEPEN.md`; prepends `"Target path: <job.input.path>\n\n"` to stdin when `input.path` is provided
- [ ] `bridge/pipelines/pdf-clone.js` runs `_Ingest/PDF-CLONE.md`; prepends `"Target path: <job.input.path>\n\n"` to stdin (path required — runner posts fail immediately if `input.path` is absent)
- [ ] All four follow the same spawn/progress/complete/fail pattern as US-303
- [ ] `runner.js` dispatches to all four new modules

### US-305: Bridge runners — SAP-NOTE and RFP-RESPONSE
**Description:** As the owner, I need runners for SAP note ingestion and RFP response so I can trigger those workflows from the Hub.

**Acceptance Criteria:**
- [ ] `bridge/pipelines/sap-note.js` runs `_Ingest/SAP-NOTE.md`; prepends `"Target path: <job.input.path>\n\n"` to stdin when `input.path` is provided
- [ ] `bridge/pipelines/rfp-response.js` runs `_Ingest/RFP-RESPONSE.md`; prepends `"Target path: <job.input.path>\n\n"` to stdin (path required — runner posts fail immediately if `input.path` is absent)
- [ ] Both follow the same spawn/progress/complete/fail pattern
- [ ] `runner.js` dispatches to both new modules

### US-306: Bridge runner — REPORT pipeline
**Description:** As the owner, I need the REPORT pipeline runner so I can push a card briefing to brief.haegens.be from the Hub.

**Acceptance Criteria:**
- [ ] `bridge/pipelines/report.js` runs `_Ingest/REPORT.md`; no path input
- [ ] Follows the same spawn/progress/complete/fail pattern
- [ ] `runner.js` dispatches to the REPORT module
- [ ] `runner.js` returns a clear error if `job.job_type` is unknown (does not silently fail)

### US-401: Agents tab in navigation
**Description:** As the owner, I need an "Agents" tab in the main navigation so I can access pipeline management without leaving the Hub.

**Acceptance Criteria:**
- [ ] A fifth nav tab labelled "Agents" added to the tab bar in `HubClient.tsx` (created by US-104)
- [ ] Tab renders `<AgentsView />` component
- [ ] `app/_components/AgentsView.tsx` file created (may be a stub for this story)
- [ ] Tab shows a badge with the count of jobs in `queued` or `running` status; badge hidden when count is 0
- [ ] Tab badge count updates when `AgentsView` fetches job data
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-402: Agent job list
**Description:** As the owner, I need to see all pipeline jobs with their current status so I know what is running, done, or failed.

**Acceptance Criteria:**
- [ ] `AgentsView` fetches `GET /api/jobs` on mount
- [ ] When any job has `status='running'`, the view re-fetches every 5 seconds
- [ ] Jobs displayed in three sections: "Active" (queued + running), "Done" (succeeded + cancelled), "Failed"
- [ ] Each job card shows: pipeline name (human-readable label), title, status pill with appropriate color, `created_at` formatted as relative time, progress bar (visible and animated when running), error summary truncated to 200 chars (visible when failed)
- [ ] Empty state when no jobs exist: "No agent jobs yet. Trigger a pipeline below."
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-403: Pipeline trigger panel
**Description:** As the owner, I need a trigger panel to start any Mitchell pipeline from the Hub with an optional file path.

**Acceptance Criteria:**
- [ ] Below the job list, a section titled "Run a pipeline" renders one row per pipeline type
- [ ] Pipeline rows: PLAUD (label: "Sync Plaud recordings", no path input), PROMPT (label: "Ingest document or URL", path optional, placeholder: "File path or URL"), EMAIL (label: "Process inbox emails", no path input), DEEPEN (label: "Deepen knowledge", path optional, placeholder: "Target note path"), PDF-CLONE (label: "Clone PDF to Markdown", path required, placeholder: "PDF file path"), SAP-NOTE (label: "Ingest SAP note", path optional, placeholder: "Note file or URL"), RFP-RESPONSE (label: "Process RFP requirements", path required, placeholder: "Requirements file path"), REPORT (label: "Push briefing report", no path input)
- [ ] Each row has a "Run" button; pressing it calls `POST /api/jobs` with the correct `job_type`, auto-generated title (e.g. "PLAUD sync — 12 Aug 2026"), and `input.path` if entered
- [ ] PDF-CLONE and RFP-RESPONSE "Run" button disabled until path is non-empty
- [ ] Button is disabled for 2 seconds after click to prevent double-submit
- [ ] On success, the new job immediately appears in the Active section
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-404: Bridge status indicator
**Description:** As the owner, I need a Bridge status chip so I know whether my Mac is connected and jobs will execute.

**Acceptance Criteria:**
- [ ] Top of `AgentsView` shows a status chip
- [ ] "Bridge online" with a green dot if `last_bridge_seen` from `GET /api/jobs` is within the last 90 seconds
- [ ] "Bridge offline — jobs will wait" with a grey dot otherwise
- [ ] Status chip updates on each poll cycle
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-405: Cancel job from UI
**Description:** As the owner, I need to cancel a queued job from the UI so I can abort work before the Bridge picks it up.

**Acceptance Criteria:**
- [ ] Jobs in "Active" section with `status='queued'` show a small "Cancel" button
- [ ] Running jobs do not show the Cancel button
- [ ] Pressing Cancel calls `POST /api/jobs/:id/cancel`
- [ ] On 200: job card status immediately updates to "Cancelled" in the UI without a full re-fetch
- [ ] On 409: shows an inline toast message "Job is already running — it will complete normally"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-501: Authorization integration tests
**Description:** As a developer, I need automated tests covering authorization on every route so a future change cannot silently remove access controls.

**Acceptance Criteria:**
- [ ] `tests/auth.test.mjs` exists
- [ ] Tests all private routes with: missing JWT header, malformed JWT, expired JWT, valid JWT for wrong email, valid JWT for wrong audience
- [ ] Tests ingest route with: missing bearer token, wrong bearer token, valid bearer token
- [ ] Tests that agent bearer token cannot access `GET /api/briefings`, `GET /api/sources`, or `PATCH /api/cards/:id`
- [ ] All tests pass with `npm test`
- [ ] Typecheck passes

### US-502: End-to-end smoke test for job lifecycle
**Description:** As a developer, I need an E2E test for the full poll-claim-complete cycle so regressions in the Bridge API are caught automatically.

**Acceptance Criteria:**
- [ ] `tests/e2e-pipeline.test.mjs` exists
- [ ] `bridge/pipelines/stub.js` exists: a pipeline that sleeps 200ms and exits 0 (used only in tests)
- [ ] Test starts Hub in test mode (`DEV_SKIP_AUTH=true`, `NODE_ENV=test`)
- [ ] Test creates a job via `POST /api/jobs` (with `job_type='stub'` registered for tests only)
- [ ] Test starts a Bridge subprocess in stub mode pointing at the test Hub
- [ ] Test polls `GET /api/jobs` until the job reaches `status='succeeded'` (timeout 10 seconds)
- [ ] Test verifies `progress_pct` was updated at least once before completion
- [ ] `npm test` runs both test files and all pass
- [ ] Typecheck passes

---

## Functional Requirements

- FR-1: Every request to `/`, `GET /api/briefings`, `GET /api/briefings/:slug`, `GET /api/sources`, `PATCH /api/cards/:id`, `POST /api/briefings/:slug/complete` must validate a Cloudflare Access JWT server-side before returning any data.
- FR-2: Auth must fail closed: if env vars are missing in production, all protected routes return 401.
- FR-3: `POST /api/ingest` must use constant-time comparison for the bearer token and enforce a 512 KiB body limit.
- FR-4: All mutation routes must validate `Origin` header against `https://brief.haegens.be` in production.
- FR-5: Security headers (CSP, HSTS, X-Frame-Options, no-store cache) applied to all responses.
- FR-6: Briefing purge must use `PRAGMA secure_delete = ON` and null all content fields including `title`, `source_name`, `source_mark`, `source_tone`, `json_path`.
- FR-7: Inbox watcher must delete source files after ingest (success or failure) rather than archiving to processed/failed.
- FR-8: Bridge is a plain Node.js ESM script; no daemon, no system installation required.
- FR-9: Bridge must validate all config at startup and print a clear error + exit 1 on misconfiguration.
- FR-10: Bridge uses exponential backoff (5s → 60s) on network errors.
- FR-11: Bridge dispatches to pipelines by reading the corresponding `_Ingest/*.md` prompt file from `VAULT_ROOT` and piping it to `claude --print --dangerously-skip-permissions` via stdin.
- FR-12: Pipelines requiring a path (PDF-CLONE, RFP-RESPONSE) must fail immediately if `input.path` is absent.
- FR-13: Hub must expose Bridge-facing API routes secured by `BRIDGE_SECRET` (separate from `BRIEFING_HUB_API_KEY`).
- FR-14: `GET /api/jobs` must return `last_bridge_seen` so the UI can display Bridge online/offline status.
- FR-15: Agent Portal must show jobs grouped by status with live auto-refresh every 5 seconds when any job is running.

## Non-Goals (Out of Scope)

- Cloudflare Access application configuration (manual deployment step).
- People Memory, CRM graph, person records.
- Work/Engagements cockpit.
- Obsidian vault read synchronization.
- Vault write-back proposals.
- Ed25519 device enrollment or Keychain storage.
- LaunchAgent or menu-bar app.
- Meeting preparation, RFP audit, or any job type beyond the 8 Mitchell pipelines.
- Push notifications.
- Multi-user access.
- Rate limiting (this is handled at Cloudflare level).

## Technical Considerations

- Auth middleware (`src/lib/auth.ts`) must use the `jose` library (or built-in Web Crypto) to validate the Cloudflare Access JWT — do not use a simple string decode.
- The Bridge is plain ESM JavaScript (`"type": "module"` in bridge/package.json) with `dotenv` as the only runtime dependency.
- Bridge pipeline files read the prompt from disk at runtime (not bundled) so prompt updates in the vault are picked up without a Bridge restart.
- The `BRIDGE_SECRET` must be a different value from `BRIEFING_HUB_API_KEY`. Both are added to `.env.example`.
- Job type `stub` is only registered in the Hub when `NODE_ENV=test` to avoid polluting production.
- The existing `app/chatgpt-auth.ts` file (trusts OpenAI-hosting headers) must not be used or extended for this authentication model.

## Success Metrics

- `curl -s https://brief.haegens.be/api/briefings` from an incognito session returns 401 or an Access redirect, not JSON.
- `npm run typecheck && npm audit --omit=dev` produce zero errors and zero high/critical advisories.
- `npm test` passes all authorization tests and the E2E pipeline smoke test.
- `node bridge/index.js` with a valid `.env` starts cleanly, triggers a PLAUD job from the Hub, and the job reaches `succeeded` status within 60 seconds on a connected Mac.

## Open Questions

- None. All scope decisions have been made.
