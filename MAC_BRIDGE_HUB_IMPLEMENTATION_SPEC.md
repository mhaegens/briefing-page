# Briefing Hub + Mac Bridge
## Implementation specification and developer handoff

**Status:** Proposed architecture for implementation  
**Audience:** Developer building the Mac Bridge and evolving Briefing Hub  
**Functional companion:** `HUB_FUNCTIONAL_SPEC_AND_AGENT_PROMPTS.md`  
**Related documents:** `briefing-hub-server-architecture-v3.md`, `RICH_CONTENT_CONTRACT.md`, `DESIGN_HANDOFF.md`  
**Primary user:** Mitchell, using the Hub mainly from an iPhone and running agents on a Mac

---

## 1. Executive summary

This document and `HUB_FUNCTIONAL_SPEC_AND_AGENT_PROMPTS.md` form the complete developer handoff. This document defines the system and trust model; the companion defines user-facing functionality, agent jobs, mandatory Mitchell system-prompt discovery, fallback prompts, and functional acceptance criteria.

Briefing Hub currently supports one direction:

```text
agent -> publish briefing -> Hub -> user reviews
```

The next version must support a complete asynchronous loop:

```text
phone -> request/decision -> Hub work queue -> Mac Bridge -> local agent or vault
phone <- curated result  <- Hub            <- Mac Bridge <- local agent or vault
```

The **Hub** is the always-available control plane. It stores structured operational data, accepts capture and decisions from any device, queues work, and presents results.

The **Mac Bridge** is the trusted local execution plane. It is the only component allowed to read selected Obsidian vault folders, write approved changes, and invoke local agents or scripts.

The Bridge is not itself an LLM. It is a dispatcher, adapter host, sync engine, offline queue, and security boundary.

The design must remain useful when the Mac is asleep:

- The Hub, People Memory, existing briefings, capture, and decisions remain available.
- New local work is shown as `waiting_for_device`.
- Knowledge search uses the last synchronized index and displays its freshness.
- Jobs begin automatically when the Bridge reconnects.
- No interface implies that an offline Mac is currently working.

---

## 2. Product outcomes

The implementation succeeds when Mitchell can:

1. Open the Hub on his phone and understand what needs attention within ten seconds.
2. Recall an external person by face, function, organisation, and engagement.
3. Capture a thought, contact, promise, or task without deciding where it belongs first.
4. Ask a local agent to do bounded work from the phone.
5. Leave the app and later receive a curated result rather than a chat transcript.
6. Search the last synchronized, explicitly allowed portion of the Obsidian vault.
7. Approve a proposed vault change before the Bridge writes it.
8. See whether the Mac and its agents are online, waiting, working, blocked, or finished.
9. Continue using the current briefing review and privacy purge flow.

### Non-goals for the first Bridge release

- Running general-purpose agents on the iPhone.
- Giving the hosted server arbitrary filesystem or shell access to the Mac.
- Mirroring the entire vault by default.
- Real-time collaborative Markdown editing.
- Silently modifying user-authored Obsidian notes.
- Replacing CRM, email, calendar, or Obsidian.
- Facial recognition or inferred personality profiling.
- Building a general multi-user orchestration platform.

---

## 3. System topology

```text
                     authenticated HTTPS
     iPhone / browser <--------------------> Briefing Hub
                                                |
                                                | SQLite + content storage
                                                v
                                      entities / jobs / events
                                                ^
                                                |
                                  long-poll + signed HTTPS requests
                                                |
                                          Mac Bridge
                                     /         |          \
                                    v          v           v
                              Obsidian vault  adapters   local spool
                                               |
                                               v
                                      local agents/scripts
```

### Deployment assumptions

- Briefing Hub remains a self-hosted web application behind HTTPS and authenticated access.
- Hub data remains in the existing persistent `/data` volume for the first implementation.
- The Bridge runs only on Mitchell's Mac under his user account.
- The Bridge initiates all network connections. The Hub never opens an inbound connection to the Mac.
- No port on the Mac is exposed to the LAN or internet.
- A localhost API or Unix domain socket may be used for local agents.

---

## 4. Responsibility and data ownership

| Concern | System of record | Notes |
|---|---|---|
| Briefing content | Hub, temporary | Existing explicit completion and purge rules remain |
| Briefing decisions | Hub | Content-minimized workflow state survives purge |
| Jobs and job status | Hub | Always visible on phone |
| People identity and relationships | Hub | Required while Mac is offline |
| Organisations and engagements | Hub | Structured operational graph |
| Long-form knowledge | Obsidian | User-authored durable notes |
| Synchronized knowledge index | Hub, derived | Only allow-listed content; replaceable and freshness-labelled |
| Vault write proposals | Hub until handled | Bridge applies only after explicit approval |
| Agent execution | Mac | Via registered, allow-listed adapters |
| Local retry queue | Mac | SQLite spool; not a second system of record |
| Photos used by People Memory | Hub private storage | Uploaded/permitted assets; never external hotlinks by default |

### Rule: one writer per field

Do not build uncontrolled bidirectional synchronization.

- Hub-owned structured fields such as a person's current organisation or role are edited in the Hub.
- Vault-authored prose remains authored in Obsidian.
- A Bridge observation from a vault note, email, or agent becomes a **suggestion** until accepted.
- An accepted Hub fact may be exported into a clearly generated section or generated note, but it must not overwrite nearby user prose.
- Every synchronized object carries a stable Hub ID and source reference.

---

## 5. Recommended repository shape

The existing application can remain at the repository root initially. Introduce shared contracts before adding behavior.

```text
/
├── app/                         # existing Hub web application and APIs
├── db/                          # Hub database schema
├── src/
│   ├── contracts/               # versioned JSON schemas and shared types
│   └── lib/                     # existing Hub services
├── bridge/
│   ├── src/
│   │   ├── cli/                 # enroll, status, doctor, pause, resume
│   │   ├── config/              # validated local configuration
│   │   ├── connection/          # auth, long-polling, retry, presence
│   │   ├── jobs/                # lease and lifecycle engine
│   │   ├── adapters/            # allow-listed agent integrations
│   │   ├── vault/               # scan, index, proposals, write-back
│   │   ├── local-api/           # loopback/Unix socket publishing interface
│   │   ├── security/            # keychain, signatures, path checks
│   │   └── storage/              # local SQLite spool
│   ├── test/
│   ├── package.json
│   └── tsconfig.json
└── packages/                    # optional later monorepo extraction
```

Use TypeScript for the first Bridge because the Hub and JSON contracts are already TypeScript-based. Package a reproducible Node runtime with the release rather than relying indefinitely on whichever Node version happens to be installed.

### macOS process model

The first release can be a headless executable managed by a per-user `launchd` LaunchAgent.

Required commands:

```text
briefing-bridge enroll
briefing-bridge start
briefing-bridge status
briefing-bridge doctor
briefing-bridge pause
briefing-bridge resume
briefing-bridge logs
briefing-bridge uninstall
```

A menu-bar interface is useful but not required for the first end-to-end milestone. When added, it should show only connection state, current job, queue size, vault freshness, pause/resume, and diagnostics.

---

## 6. Shared protocol conventions

All Bridge/Hub payloads must:

- Have an explicit `schema_version`.
- Use opaque stable IDs generated by the owning system.
- Use ISO 8601 UTC timestamps over the wire.
- Accept an `idempotency_key` for mutating requests.
- Include a correlation ID in responses and logs.
- Reject unknown high-risk fields rather than silently accepting them.
- Enforce body size and array length limits.
- Never contain executable shell strings.

Example envelope:

```json
{
  "schema_version": "1.0",
  "event_id": "evt_01K...",
  "event_type": "job.progressed",
  "occurred_at": "2026-08-12T08:42:11Z",
  "device_id": "dev_01K...",
  "correlation_id": "cor_01K...",
  "payload": {}
}
```

Contracts should be defined once as JSON Schema, compiled into TypeScript types, and contract-tested in both the Hub and Bridge.

---

## 7. Device enrollment and authentication

### Enrollment flow

1. An authenticated user opens **Settings -> Mac Bridge -> Add this Mac**.
2. The Hub creates a single-use enrollment code that expires after ten minutes.
3. The user runs `briefing-bridge enroll <hub-url> <code>` on the Mac.
4. The Bridge generates an Ed25519 key pair locally.
5. The private key is stored in macOS Keychain and never sent to the Hub.
6. The Bridge sends its public key, chosen device name, Bridge version, and supported capabilities with the enrollment code.
7. The Hub registers the device and invalidates the code.
8. The UI shows the new device and its first heartbeat.

### Request signing

Each Bridge request signs a canonical message containing:

```text
HTTP method
request path
SHA-256 body digest
timestamp
nonce
device ID
```

The Hub verifies the signature against the registered public key, rejects revoked devices, rejects stale timestamps, and stores recent nonces for replay protection.

If Cloudflare Access protects the domain, use a narrowly scoped machine/service policy for `/api/bridge/*`. Do not bypass authentication for every `/api/*` route. Application-level device verification remains required even behind the access gateway.

### Device controls

The Hub must support:

- View device name, status, version, capabilities, and last seen time.
- Revoke device immediately.
- Require re-enrollment after key loss.
- Rotate enrollment and service credentials.
- Prevent a revoked device from claiming or completing work.

---

## 8. Presence and connectivity

The Bridge sends a heartbeat every 30 seconds while connected and immediately after wake or network restoration.

```json
{
  "schema_version": "1.0",
  "bridge_version": "0.1.0",
  "status": "idle",
  "active_job_id": null,
  "queued_local_events": 0,
  "vault": {
    "status": "ready",
    "last_indexed_at": "2026-08-12T08:40:00Z",
    "pending_changes": 0
  },
  "capabilities": [
    "vault.search.v1",
    "vault.propose-write.v1",
    "agent.meeting-prep.v1",
    "agent.rfp-audit.v1"
  ]
}
```

Hub-derived states:

- `online_idle`: recent heartbeat, no active work.
- `online_working`: heartbeat identifies an active job.
- `paused`: Bridge intentionally paused.
- `offline`: heartbeat overdue by more than 90 seconds.
- `update_required`: Bridge protocol version unsupported.
- `error`: Bridge reports a persistent local failure.

“Offline” is normal and should not be styled as an emergency.

---

## 9. Job model

### Principle

The Hub may ask for a typed capability. It must never send an arbitrary command, executable path, working directory, or unrestricted environment variable.

```json
{
  "schema_version": "1.0",
  "job_id": "job_01K...",
  "job_type": "meeting.prepare",
  "job_version": 1,
  "title": "Prepare DKG architecture review",
  "created_at": "2026-08-12T08:45:00Z",
  "requested_by": "user_mitchell",
  "target_device_id": "dev_01K...",
  "priority": "normal",
  "expires_at": "2026-08-13T08:45:00Z",
  "context_refs": [
    { "type": "engagement", "id": "eng_dkg" },
    { "type": "meeting", "id": "meet_01K..." },
    { "type": "vault_scope", "id": "scope_customer_projects" }
  ],
  "input": {
    "objective": "Prepare a concise pre-read and three questions to ask",
    "output_style": "curated_briefing"
  }
}
```

### State machine

```text
queued
  -> waiting_for_device
  -> leased
  -> running
     -> needs_input -> running
     -> succeeded
     -> failed_retryable -> queued
     -> failed_final
     -> cancelled
     -> expired
```

Use at-least-once delivery:

- A claim grants a 60-second lease.
- A running Bridge renews the lease every 20 seconds.
- If the lease expires, the Hub may make the job claimable again.
- Adapters and result ingestion must be idempotent.
- A `job_id` plus `attempt` uniquely identifies an attempt.
- Do not retry a job that may have produced an irreversible side effect unless its adapter explicitly supports safe replay.

Use authenticated long polling for the first version:

```text
GET /api/bridge/v1/jobs/next?wait_seconds=25
```

WebSockets are unnecessary initially. Long polling survives proxies, sleep/wake, and reconnects with less operational complexity.

---

## 10. Adapter model

Each local capability is an adapter registered in Bridge configuration.

```ts
interface BridgeAdapter<TInput, TOutput> {
  manifest: {
    jobType: string;
    version: number;
    displayName: string;
    requiresVaultScopes: string[];
    sideEffectClass: "read_only" | "draft_only" | "external_write";
    cancellable: boolean;
    timeoutSeconds: number;
  };

  validate(input: unknown): TInput;
  execute(context: JobContext, input: TInput): Promise<TOutput>;
  cancel?(attemptId: string): Promise<void>;
}
```

Initial capabilities:

| Job type | Purpose | Side effects |
|---|---|---|
| `meeting.prepare` | Build pre-read from people, engagement, and selected vault context | Read-only; publishes briefing |
| `meeting.process_notes` | Extract people, commitments, and follow-ups | Creates suggestions only |
| `rfp.audit` | Review supplied RFP materials and selected evidence | Read-only; publishes briefing |
| `knowledge.search` | Search synchronized/local vault content with citations | Read-only |
| `knowledge.propose_note` | Draft a new note or patch | Proposal only |
| `person.research_context` | Gather permitted context for a known person | Suggestions only |
| `briefing.publish` | Validate and forward a local briefing | Hub write only |

### Invoking existing agents

Support a process adapter, but never invoke through a shell string.

- Store an allow-listed executable path and fixed argument template in local configuration.
- Use `spawn(executable, args, { shell: false })`.
- Write job input into a private temporary directory with restrictive permissions.
- Pass file paths or JSON over stdin.
- Capture structured stdout separately from redacted diagnostic logs.
- Enforce timeouts and maximum output sizes.
- Do not inherit the entire Bridge environment. Pass an explicit allow-list.

### Claude Code CLI as the primary reference adapter

Claude Code CLI is a first-class Bridge execution target, not an unspecified future integration. The development team must implement and test a `ClaudeCodeAdapter` that translates allow-listed Hub job types into constrained, non-interactive Claude Code runs.

The currently verified local installation is:

```text
executable: /Users/I584748/.local/bin/claude
verified version: 2.1.119
non-interactive mode: --print / -p
structured stream: --output-format stream-json
structured result validation: --json-schema
tool restriction: --allowedTools / --disallowedTools
cost bound: --max-budget-usd
model selection: --model
effort selection: --effort
```

The executable path and supported flags must be discovered by `briefing-bridge doctor`; do not permanently assume this exact path or version. Bridge startup should call `claude --version`, compare it to a tested compatibility range, and expose `ready`, `authentication_required`, `not_installed`, or `unsupported_version` to the Hub.

The adapter must launch Claude directly with Node's argument-array process API:

```ts
const child = spawn(config.claudeExecutable, [
  "--print",
  "--output-format", "stream-json",
  "--json-schema", JSON.stringify(outputSchema),
  "--allowedTools", toolAllowList.join(","),
  "--max-budget-usd", String(policy.maxBudgetUsd),
  "--model", policy.model,
  "--effort", policy.effort,
  "--no-session-persistence"
], {
  cwd: approvedWorkingDirectory,
  shell: false,
  env: explicitEnvironment
});

child.stdin.end(renderedPrompt);
```

This is illustrative code, not permission to concatenate Hub data into arguments. Prompt and job context should be sent through stdin or private input files so they do not appear in process listings. The adapter must parse the installed version's actual stream events rather than relying on undocumented event names.

#### Required execution policy per Claude adapter

Each job-type manifest defines:

- Claude model and effort level;
- fixed system prompt identifier and version;
- allowed tools and explicitly denied tools;
- approved working directory and additional read directories;
- maximum runtime, output bytes, and budget;
- whether session persistence is disabled or an explicit Hub session mapping is used;
- expected JSON output schema;
- whether the output is a briefing, entity observation set, answer, or vault proposal;
- cancellation behavior;
- retry policy and side-effect classification.

Use the smallest tool set needed:

| Function | Typical Claude tools | Rule |
|---|---|---|
| Meeting preparation | Read, Grep, Glob | No writes or Bash |
| RFP audit | Read, Grep, Glob | No writes unless creating a draft in an isolated workspace is explicitly enabled |
| Knowledge answer | Read, Grep, Glob | Read-only and citation-required |
| People extraction | Read | Input bundle only; output observations, not canonical mutations |
| Vault note proposal | Read, Grep, Glob | Claude returns proposed content; Bridge performs no write until Hub approval |
| Repository coding job | Job-specific tools in a disposable worktree | Separate high-risk capability, disabled by default |

Never use `--dangerously-skip-permissions` or `--allow-dangerously-skip-permissions`. Do not let a Hub payload choose `--allowedTools`, `--add-dir`, `--plugin-dir`, `--mcp-config`, `--settings`, `--permission-mode`, the executable, or the working directory. Those values belong to trusted local policy.

For a headless job, interactive permission questions cannot be left waiting. A read-only adapter should be designed so every required tool is pre-authorized and every other tool is unavailable. If the job needs a new scope or side effect, stop it as `needs_input`; do not broaden permissions automatically.

#### Claude authentication under `launchd`

Claude may work in an interactive terminal but fail under a background LaunchAgent because its environment or credential access differs. `briefing-bridge doctor` and installation tests must run a minimal non-sensitive Claude request through the same user, environment, working directory rules, and process-launch path used by the daemon.

Report these separately:

- CLI installed and compatible;
- credentials available to the LaunchAgent;
- model reachable;
- configured tools accepted;
- structured output validated;
- test budget consumed.

Do not copy Claude credentials into Bridge configuration to work around a Keychain or environment problem. Fix the per-user service configuration or use an explicitly provisioned credential mechanism supported by the installed CLI.

#### Prompt selection

Before installing a fallback system prompt, the developer must search **Mitchell**—the internal prompt/knowledge tool—for an existing system prompt matching the adapter's function. The search, evaluation, versioning, and fallback procedure is defined in `HUB_FUNCTIONAL_SPEC_AND_AGENT_PROMPTS.md`. The Bridge stores the selected prompt by stable identifier and version; it must not silently replace prompts when Mitchell search results change.

#### Progress, questions, and results

- Convert safe stream events into coarse Hub progress, not raw chain-of-thought or verbose transcripts.
- Never store or display hidden reasoning.
- If Claude needs a human decision, terminate or suspend according to adapter support and publish a structured `needs_input` question with at most three choices.
- Validate the final object against the job's output schema before accepting it.
- A successful CLI exit with invalid JSON is `ADAPTER_INVALID_OUTPUT`, not job success.
- Save full raw output only in a short-lived, access-restricted diagnostic bundle when explicitly enabled; default logs remain content-free.
- Convert successful user-facing work into the Hub's rich briefing contract or another named structured result contract.

### Local publishing interface

Existing agents may keep posting directly to the Hub. Preferably, they publish through the Bridge so it can validate, attach provenance, buffer offline, and centralize credentials.

Provide either a Unix socket:

```text
~/Library/Application Support/Briefing Bridge/bridge.sock
```

or a loopback-only endpoint with a per-install local token:

```text
POST /local/v1/briefings
POST /local/v1/events
GET  /local/v1/status
```

Never bind the local publishing API to `0.0.0.0`.

---

## 11. Hub API additions

Paths are illustrative but should be versioned before implementation.

### Enrollment and devices

```text
POST   /api/devices/enrollment-codes       authenticated UI creates code
POST   /api/bridge/v1/enroll               Bridge exchanges code and public key
GET    /api/devices                        list enrolled devices
DELETE /api/devices/:deviceId              revoke device
POST   /api/bridge/v1/heartbeat             presence and capabilities
```

### Jobs

```text
POST /api/jobs
GET  /api/jobs
GET  /api/jobs/:jobId
POST /api/jobs/:jobId/cancel
POST /api/jobs/:jobId/retry

GET  /api/bridge/v1/jobs/next
POST /api/bridge/v1/jobs/:jobId/claim
POST /api/bridge/v1/jobs/:jobId/heartbeat
POST /api/bridge/v1/jobs/:jobId/input
POST /api/bridge/v1/jobs/:jobId/complete
POST /api/bridge/v1/jobs/:jobId/fail
```

### People and relationship graph

```text
GET    /api/people
POST   /api/people
GET    /api/people/:personId
PATCH  /api/people/:personId
POST   /api/people/:personId/photo
DELETE /api/people/:personId/photo

GET    /api/organisations
POST   /api/organisations
GET    /api/engagements
POST   /api/engagements
POST   /api/interactions

GET    /api/observations?status=proposed
POST   /api/observations/:id/accept
POST   /api/observations/:id/reject
POST   /api/people/merge
```

### Vault and knowledge

```text
POST /api/bridge/v1/vault/manifests
POST /api/bridge/v1/vault/documents
POST /api/bridge/v1/vault/deletions
GET  /api/knowledge/search

POST /api/vault-proposals
POST /api/vault-proposals/:id/approve
POST /api/vault-proposals/:id/reject
GET  /api/bridge/v1/vault-proposals
POST /api/bridge/v1/vault-proposals/:id/result
```

### Capture

```text
POST /api/captures
GET  /api/captures?status=unprocessed
POST /api/captures/:id/file
POST /api/captures/:id/dismiss
```

All UI mutations require the authenticated user session and CSRF protection. Bridge routes require registered-device authentication and must not depend on a broadly shared agent API key.

---

## 12. Hub database additions

Create migrations rather than mutating tables ad hoc.

### Core tables

#### `devices`

- `id`, `display_name`, `public_key`, `status`
- `bridge_version`, `capabilities_json`
- `last_seen_at`, `enrolled_at`, `revoked_at`

#### `jobs`

- `id`, `job_type`, `job_version`, `title`
- `input_json_encrypted_or_minimized`, `status`, `priority`
- `requested_by`, `target_device_id`, `idempotency_key`
- `not_before`, `expires_at`, `created_at`, `started_at`, `finished_at`

#### `job_attempts`

- `id`, `job_id`, `attempt_number`, `device_id`
- `lease_token_hash`, `lease_expires_at`
- `progress_percent`, `progress_label`, `error_code`
- `started_at`, `heartbeat_at`, `finished_at`

#### `job_events`

Append-only content-minimized timeline: state transitions, actor, timestamp, correlation ID, and non-sensitive metadata.

### Relationship graph

#### `people`

- `id`, `display_name`, `given_name`, `family_name`
- `pronunciation`, `preferred_name`, `photo_asset_id`
- `primary_organisation_id`, `current_role`, `location`
- `how_we_know_them`, `memory_cue`
- `last_interaction_at`, `next_step`
- `created_at`, `updated_at`, `archived_at`

#### `person_aliases`

Email addresses, spelling variants, and source-system identifiers. Do not use an email address as the primary key.

#### `organisations`

- `id`, `name`
- `kind`: customer, prospect, partner, internal, other
- `domain`, `logo_asset_id`, `notes_summary`

#### `engagements`

- `id`, `name`, `organisation_id`
- `kind`: opportunity, project, partner_motion, event, other
- `stage`, `status`, `next_commitment`, `next_commitment_at`

#### `person_engagements`

Many-to-many relationship containing function in the engagement, influence, first/last seen date, and confirmed status.

#### `interactions`

- `id`, `person_id`, `engagement_id`
- `kind`: meeting, email, call, event, note
- `occurred_at`, `summary`, `source_ref_id`

#### `commitments`

- `id`, `person_id`, `engagement_id`
- `direction`: owed_by_me, owed_to_me, mutual
- `summary`, `due_at`, `status`, `source_ref_id`

#### `observations`

Agent- or sync-proposed facts with field path, proposed value, confidence, source, observed date, and accepted/rejected state. Accepting an observation updates the canonical record in one transaction.

### Knowledge synchronization

Add `vault_scopes`, `knowledge_documents`, `knowledge_chunks`, `source_refs`, and `vault_write_proposals`.

Derived knowledge must be deletable independently of the source vault. Treat filenames as potentially sensitive.

### Photos and assets

Store People Memory photos in private application storage, not public URLs. Produce bounded thumbnails server-side, strip unnecessary metadata, validate MIME and dimensions, and support permanent deletion.

---

## 13. Obsidian read synchronization

### Configuration

```yaml
vault:
  root: "/Users/.../iCloud~md~obsidian/Documents/Mitchell"
  scopes:
    - id: "people_notes"
      path: "People"
      mode: "content"
    - id: "customer_projects"
      path: "Projects"
      mode: "content"
    - id: "everything_else"
      path: "."
      mode: "metadata_only"
  excludes:
    - ".obsidian"
    - ".trash"
    - "Attachments/Private"
    - "**/.DS_Store"
```

Defaults must be restrictive. The user explicitly expands scopes. The vault should be marked **Keep Downloaded** in Finder, but the Bridge must still handle unavailable iCloud placeholders without treating them as deletions.

### Scan pipeline

1. Resolve and validate the configured vault root.
2. Walk only configured scopes.
3. Reject symlinks that escape the vault root.
4. Ignore hidden/configuration paths unless explicitly enabled.
5. Read Markdown files with a maximum size limit.
6. Parse properties, headings, tags, and internal links.
7. Normalize line endings and compute a SHA-256 content hash.
8. Compare against the local manifest.
9. Chunk changed content on semantic Markdown boundaries.
10. Send only permitted fields/content to the Hub.
11. Update the local manifest after the Hub acknowledges the batch.

Use filesystem events to trigger scans and a periodic reconciliation because events can be missed across sleep, iCloud updates, or restarts.

### Search result contract

Every phone result includes:

- Note display title and short excerpt.
- Vault scope, heading/block location, and source identifier.
- Last indexed timestamp.
- A freshness warning when the Bridge is offline or the index is stale.

Never present derived agent text as though it were a direct vault quote.

### Deletion behavior

- First mark a locally missing note as missing.
- Recheck after a grace period so an iCloud placeholder or rename is not treated as deletion.
- Then delete its Hub document/chunks.
- Deleting Hub-derived search content never deletes the source vault note.

---

## 14. Obsidian write-back

The Hub never directly edits a vault document.

```json
{
  "schema_version": "1.0",
  "proposal_id": "vwp_01K...",
  "operation": "create_note",
  "vault_scope_id": "people_notes",
  "relative_path": "People/Sophie De Smet.md",
  "expected_base_hash": null,
  "content": "---\nhub_person_id: per_01K...\n---\n...",
  "reason": "Create a durable note for the confirmed person",
  "status": "approved"
}
```

Initial operations:

- `create_note` in approved destinations.
- `append_to_generated_section` using explicit markers.
- `replace_generated_section` with an expected base hash.

Do not support arbitrary deletion or whole-file replacement in the first release.

### Safe apply sequence

1. Verify proposal approval and device lease.
2. Resolve the destination inside an allowed writable scope.
3. Reject traversal and escaping symlinks.
4. Read the current file and verify `expected_base_hash`.
5. If it differs, stop with `conflict`; do not auto-merge.
6. Create a recoverable local backup or patch record.
7. Write a temporary file in the same directory.
8. Flush and atomically rename.
9. Re-read and hash the result.
10. Report success and resulting hash.

The UI shows the exact change before approval and a clear conflict card if the note changed meanwhile.

---

## 15. People Memory behavior

People Memory connects faces, names, functions, organisations, and engagements. It is a recall aid, not surveillance or personality scoring.

### People index

- Face-forward cards.
- Search name, company, role, engagement, and aliases.
- Filters for customer, partner, internal, recently met, and needs verification.
- Support relationship questions such as “Who was involved in DKG?”
- Show duplicate candidates for confirmation; never auto-merge.

### Person detail

The first viewport answers:

1. Who is this?
2. Where do they work and what do they do?
3. Where do I know them from?
4. What do I owe them or need from them?

Then show engagement memberships, interaction timeline, commitments, trusted notes, source links, and proposed updates.

### Meeting recall strip

Before a meeting, show relevant faces with one-line cues:

```text
Sophie De Smet
Architecture lead · DKG
Raised the Azure-only concern in Antwerp
```

### Maintenance workflow

Agents create observations instead of mutating facts:

```json
{
  "person_id": "per_01K...",
  "field": "current_role",
  "proposed_value": "Enterprise Architecture Lead",
  "confidence": 0.86,
  "observed_at": "2026-08-12T07:30:00Z",
  "source_ref": {
    "kind": "meeting_note",
    "label": "DKG architecture review notes",
    "locator": "vault://Projects/DKG/Meetings/2026-08-11.md"
  }
}
```

The user sees `Confirm`, `Edit`, or `Ignore`. Accepted values retain provenance and verification date.

### Photo policy

- Prefer a photo deliberately uploaded by the user or a permitted contact/company source.
- Record source and retrieval date.
- Do not scrape or hotlink social profile photos by default.
- Do not perform biometric identification.
- Provide immediate replace and delete controls.

---

## 16. Capture and triage

The phone needs a universal capture action from every primary view.

Initial capture is text; voice transcription and attachments can follow. Store the capture immediately, then asynchronously propose:

- Add/update a person.
- Link to an organisation or engagement.
- Create a commitment.
- Queue agent work.
- Create a vault write proposal.
- Keep as an unfiled note.
- Discard.

Filing is reversible. Successful capture should not require classification first.

---

## 17. UI status language

| Technical state | User language |
|---|---|
| Bridge online and idle | Mac ready |
| Bridge offline | Mac offline · work will wait safely |
| Job queued with offline target | Waiting for your Mac |
| Job leased/running | Agent working |
| Job needs input | Needs your decision |
| Job succeeded | Ready to review |
| Retryable failure | Paused · will retry |
| Final failure | Could not finish |
| Vault index current | Knowledge current |
| Vault index stale | Last synced … |

Do not use red for expected offline state. Reserve coral for genuine risk or failure.

---

## 18. ADHD-oriented interaction requirements

- One dominant action per viewport.
- Never put more than three items in the Focus Beacon.
- Every job shows why it matters, current state, and the next action.
- Show honest effort labels such as `2 min`, `10 min`, or `deep work`.
- Preserve a resume capsule across devices.
- Use progressive disclosure: callout -> summary -> bullets/visual -> evidence.
- Make deferring shame-free and preserve context when it returns.
- Group routine agent completions instead of notifying for every event.
- Avoid streaks, punitive overdue counters, and infinite activity feeds.
- Make empty and waiting states calm and informative.
- After completion, return attention to the next meaningful item.

---

## 19. Security and privacy requirements

### Remote execution boundary

- No arbitrary shell, AppleScript, executable path, raw SQL, or unrestricted filesystem operation may arrive in a Hub job.
- Job type and version map to a locally installed adapter.
- Unknown job types fail closed.
- Each adapter declares vault scopes and side-effect class.
- `external_write` adapters require an additional confirmation policy.

### Filesystem boundary

- Canonicalize all paths before access.
- Require every target to remain under an allowed scope.
- Reject traversal, escaping symlinks, device files, and unexpected file types.
- Run as the user, never root.
- Do not request Full Disk Access when scoped folder access is sufficient.

### Secrets

- Store device private key, service credentials, and local token in macOS Keychain.
- Never store them in the vault, repository, shell history, or job payloads.
- Never pass all parent environment variables into an adapter.

### Data minimization

- Keep existing briefing purge behavior.
- Give synchronized knowledge separate retention/deletion controls.
- Let each vault scope be `metadata_only`, `content`, or disabled.
- Do not put note text, people details, prompts, or output in routine logs.
- Redact or hash sensitive paths in remote telemetry.
- Support deleting a person and private assets subject to required operational records.

### Web/API controls

- Separate user, publisher, and Bridge routes.
- Narrow Cloudflare policies by path and identity type.
- Rate-limit enrollment, authentication failures, search, and uploads.
- Apply CSRF protection to browser mutations.
- Sanitize Markdown and links.
- Use private cache controls for personal data.

---

## 20. Offline behavior and local spool

The Bridge keeps a small local SQLite database containing:

- Acknowledged Hub cursor.
- Pending outbound events.
- In-progress attempt metadata and idempotency keys.
- Vault file manifest and hashes.
- Approved write proposals being applied.
- Redacted diagnostics.

It must not become a permanent duplicate of Hub content.

### Retry policy

- Exponential backoff with jitter.
- Reset after confirmed connectivity.
- Honor `Retry-After`.
- Persist unsent events before acknowledging local completion.
- Cap retries by job expiry and error type.
- Do not retry validation, authorization, revocation, or unsupported-version failures automatically.

### Sleep and wake

On wake:

1. Invalidate assumptions about network connections.
2. Send a heartbeat.
3. Reconcile job leases.
4. Flush outbound events.
5. Run a bounded vault reconciliation.
6. Resume long polling.

---

## 21. Observability and diagnostics

### Hub metrics

- Devices online/offline.
- Jobs by state and age.
- Claim latency and execution duration by type.
- Retry/failure counts by error code.
- Vault index freshness.
- Pending observations and write proposals.

### Local diagnostics

`briefing-bridge doctor` checks:

- Configuration validity.
- Keychain credential availability.
- Hub reachability and time synchronization.
- Device registration/revocation.
- Vault root and scope readability.
- Local spool health.
- Adapter executable availability.
- Writable proposal destination.
- Protocol compatibility.

Logs contain correlation IDs, state transitions, durations, and error codes—not note text, people data, prompts, or result bodies.

---

## 22. Stable error codes

```text
DEVICE_REVOKED
DEVICE_UPDATE_REQUIRED
CAPABILITY_UNAVAILABLE
JOB_EXPIRED
JOB_CANCELLED
JOB_LEASE_LOST
ADAPTER_TIMEOUT
ADAPTER_INVALID_OUTPUT
ADAPTER_PROCESS_FAILED
CLAUDE_NOT_INSTALLED
CLAUDE_VERSION_UNSUPPORTED
CLAUDE_AUTH_REQUIRED
CLAUDE_MODEL_UNAVAILABLE
CLAUDE_BUDGET_EXCEEDED
VAULT_OFFLINE_PLACEHOLDER
VAULT_SCOPE_DENIED
VAULT_FILE_TOO_LARGE
VAULT_WRITE_CONFLICT
VAULT_WRITE_FAILED
HUB_UNREACHABLE
RATE_LIMITED
INVALID_SIGNATURE
```

The phone translates these into calm, actionable language and hides implementation detail unless diagnostics are opened.

---

## 23. Testing strategy

### Contract tests

- Every example validates against its schema.
- Hub and Bridge agree on enums and required fields.
- Unsupported schema/job versions fail clearly.

### Hub tests

- Enrollment expiry and one-time use.
- Signature verification and replay rejection.
- Device revocation.
- Leasing, heartbeat, lease expiry, and duplicate completion.
- Authorization separation between browser, publisher, and Bridge routes.
- People merge and observation acceptance transactions.
- Search scope enforcement.
- Existing briefing purge behavior remains unchanged.

### Bridge tests

- Offline queue survives restart.
- Sleep/wake reconnection.
- Adapter timeout and cancellation.
- No `shell: true` execution path.
- Environment allow-list.
- Path traversal and symlink escape rejection.
- iCloud placeholder does not become false deletion.
- File hash conflict blocks write-back.
- Repeated job delivery remains idempotent.
- Claude Code is invoked with `shell: false` and a fixed local argument policy.
- Hub job input cannot change Claude tools, directories, settings, plugins, model, or executable.
- Claude authentication is tested under the actual LaunchAgent environment.
- Stream events produce safe coarse progress without persisting hidden reasoning.
- Valid exit plus schema-invalid output fails as `ADAPTER_INVALID_OUTPUT`.
- Cancellation terminates the Claude process tree and reports the final attempt state once.

### End-to-end scenarios

1. Queue meeting preparation on phone while Mac is offline; reconnect Mac; result arrives.
2. Agent proposes a role change; accept on phone; provenance remains visible.
3. Approve a new Obsidian note; Bridge writes it and returns the resulting hash.
4. Edit the target before approval; Bridge reports conflict and preserves both versions.
5. Revoke the Mac during a job; subsequent requests fail and the lease expires safely.
6. Purge a briefing; related job state remains but content cannot reopen.

---

## 24. Delivery plan

### Milestone 0 — contracts and migration discipline

- Extract shared schemas and types.
- Add migration tooling for new Hub tables.
- Separate browser, publisher, and Bridge authentication.
- Add correlation IDs and safe errors.

**Exit:** Existing briefing behavior passes unchanged and contract tests run in CI.

### Milestone 1 — connected Bridge skeleton

- Bridge CLI and validated configuration.
- Ed25519 enrollment and Keychain storage.
- `launchd` installation.
- Heartbeat, device list, pause/resume, and diagnostics.
- Hub status component.

**Exit:** The phone accurately shows Mac ready/offline/paused and last seen.

### Milestone 2 — two-way job loop

- Job tables and APIs.
- Long polling, leases, heartbeat, retry, and cancellation.
- One harmless reference adapter.
- Agent Desk UI.
- Local offline spool.

**Exit:** A phone-created job waits through Mac offline, runs after reconnect, and returns an idempotent result.

### Milestone 3 — local publishing and first real adapter

- Loopback/Unix-socket publishing API.
- Briefing validation through Bridge.
- Implement `ClaudeCodeAdapter` and use it for `meeting.prepare` or `rfp.audit`.
- Discover a matching system prompt in Mitchell or install the reviewed fallback from the companion functional specification.
- Add CLI version, authentication, model, tool-policy, schema-output, budget, timeout, and cancellation diagnostics.
- Progress and `needs_input` flow.

**Exit:** A local agent publishes without the Hub's general API credential, and phone-requested work returns as a curated briefing.

### Milestone 4 — scoped Obsidian read sync

- Vault scope configuration and Keep Downloaded check.
- Manifest, Markdown parsing, hashing, chunking, and reconciliation.
- Derived knowledge index and freshness UI.
- Search with citations.

**Exit:** Phone search returns only allowed notes with source and freshness; offline state is honest.

### Milestone 5 — People Memory

- People, organisations, engagements, interactions, commitments, observations, photos.
- Face-forward UI and person detail.
- Observation confirmation and duplicate merge.
- Meeting recall strip.

**Exit:** A person can be recalled by face, function, organisation, engagement, and recent context while the Mac is offline.

### Milestone 6 — approved write-back and capture

- Universal phone capture.
- Classification suggestions.
- Vault proposal review and safe Bridge apply.
- Conflicts and recovery.

**Exit:** A phone capture can become an approved vault note without silent overwrite or data loss.

---

## 25. First developer backlog

1. Create shared contract package and version rules.
2. Add migrations for devices, jobs, attempts, and events.
3. Implement one-time device enrollment.
4. Implement Bridge request signing and replay protection.
5. Scaffold Bridge CLI, config, Keychain access, and local SQLite.
6. Install/uninstall Bridge as a user LaunchAgent.
7. Implement heartbeat and Hub device UI.
8. Implement job creation, long polling, lease, progress, completion, cancellation, and expiry.
9. Implement a reference adapter and offline end-to-end test.
10. Implement `ClaudeCodeAdapter` with strict local policies and structured-output validation.
11. Implement Mitchell system-prompt discovery/selection and version pinning from the companion functional specification.
12. Implement local agent publishing and a migration guide from direct Hub POSTs.
13. Add vault scope selection and doctor checks.
14. Implement manifest synchronization and knowledge search.
15. Add People graph migrations and APIs.
16. Add observation accept/edit/reject workflow.
17. Add private photo storage and thumbnail pipeline.
18. Add vault proposal review and conflict-safe apply.
19. Threat-model revocation, replay, traversal, Claude tool-policy injection, and malicious adapter output.

---

## 26. Definition of the first useful release

Do not wait for every envisioned module. The first useful release contains:

- An enrolled Mac Bridge with honest presence.
- A phone-created work queue.
- One real local agent adapter.
- Existing curated briefings as the result format.
- People Memory with manual editing and agent-proposed updates.
- Scoped, read-only Obsidian indexing with citations.
- Clear offline and last-synced states.
- No arbitrary remote execution.
- No automatic vault overwrite.

This release proves the central product question: whether a calm phone interface can help Mitchell capture, remember, decide, and delegate while the Mac safely performs the work.

---

## 27. UI-first prototype map

The standalone `prototype.html` demonstrates the proposed behavior with fictional data. It is intentionally broader than the first engineering milestone so features can be accepted, rejected, or simplified before implementation.

| Prototype area | Product question being tested |
|---|---|
| Today | Does one focus, meeting runway, resume point, energy filter, and quiet agent summary reduce context switching? |
| Focus Beacon | Are the interruption rules strict enough? |
| Mac status | Is online/offline and last-sync state understandable without technical language? |
| People index | Can a person be found by face, role, company, engagement, or remembered detail? |
| Person detail | Does “remember” context appear before timelines and metadata? |
| Memory suggestion | Is confirm/edit/ignore lightweight enough to maintain People Memory? |
| Work cockpit | Is linking risk, people, evidence, and commitments more useful than a generic task list? |
| Knowledge | Is a last-synced vault answer with citations trustworthy and useful? |
| Vault proposal | Does exact-path and exact-change approval feel safe enough for write-back? |
| Agents | Are working, ready, waiting, and failed sufficient states? |
| Offline preview | Does the product remain calm and useful while the Mac is unavailable? |
| Quick capture | Is “save first, file later” lower-friction than immediate classification? |
| Job composer | Does bounded delegation make the Hub feel like a remote control rather than an agent chat? |

The portrait contact sheet in `public/assets/people-memory-portraits.png` contains synthetic prototype identities. It must not be reused as real contact data.
