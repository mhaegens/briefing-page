# Briefing Hub
## Server-side architecture and product brief

**Status:** Security-hardened architecture for implementation  
**Revision:** v3, restores briefing-level JSON with ordered cards, explicit completion confirmation, content purge, and Stage 2 agent status integration  
**Primary goal:** Build the server-side product that receives structured JSON briefing documents containing ordered cards and presents them as a consistent, mobile-first briefing experience.  
**Current scope:** Server, secure storage, JSON ingestion, API, web application, authenticated access, cryptic per-briefing URLs, ordered card review, explicit completion confirmation, content deletion, and deployment.  
**Later scope:** AI agents publishing briefings, consuming user decisions, and taking follow-up actions.

**Security posture:** Privacy-by-design and data-minimisation first. The application should assume that briefing content can contain confidential business information and personal data, even when the initial use case is personal.

---

## 1. Product idea

The Briefing Hub is a personal web application that gives automated tools and, later, AI agents one consistent way to communicate with the user.

Instead of every agent generating its own HTML report, email, Markdown page, dashboard, or notification format, every source produces the same structured JSON format.

The Briefing Hub owns the presentation layer.

```text
Source / Agent
      |
      | briefing JSON
      v
Briefing Hub
      |
      +--> validation
      +--> storage
      +--> indexing
      +--> user state
      |
      v
Mobile web app / PWA
      |
      +--> briefing inbox
      +--> swipeable cards
      +--> expanded detail
      +--> read / unread
      +--> later: user decisions
```

This separation is important.

The producer decides **what needs to be communicated**.

The Briefing Hub decides **how it is presented and reviewed**.

---

## 2. Key design decision

### Do not generate a new website for every briefing

A briefing should not contain its own React code, CSS, JavaScript, or HTML shell.

The server hosts one application.

Each briefing is data.

For example:

```text
https://brief.haegens.be/
```

The application might display briefing:

```text
briefing_01JXYZ...
```

by fetching:

```text
GET /api/briefings/briefing_01JXYZ...
```

The briefing itself is stored as JSON.

This means the UI can be redesigned later without regenerating old briefings.

A briefing from six months ago will automatically use the newest UI when opened.

---

## 3. Recommended architecture

The product should be a small self-hosted web application with four main pieces.

```text
                     Internet / VPN
                           |
                           v
                  Cloudflare / HTTPS
                           |
                           v
                Nginx Proxy Manager
                           |
                           v
                Briefing Hub service
                 /                \
                /                  \
               v                    v
        React web app          REST API
                                   |
                        +----------+----------+
                        |                     |
                        v                     v
                   JSON files             SQLite
                briefing payloads     metadata + state
```

### Recommended stack

**Frontend**

- React
- Vite
- TypeScript
- Mobile-first responsive design
- PWA support
- Swipe gestures using a modern gesture/animation library
- Installed to the iPhone home screen as a web app

**Backend**

- Node.js
- TypeScript
- Fastify
- JSON Schema validation
- REST API

**Storage**

- JSON files for immutable briefing content
- SQLite for indexes, status, users, actions, and future agent workflow state

**Deployment**

- Docker Compose
- One application container
- One persistent `/data` volume
- Reverse proxied through the existing Nginx Proxy Manager layer
- HTTPS
- Authentication in front of the application

This is intentionally a small stack. There is no need for PostgreSQL, Kubernetes, Redis, Kafka, or a separate frontend hosting platform for the first viable product.

---

## 4. Content unit, briefing JSON and SQLite

The durable content unit is a **briefing**.

One active briefing corresponds to one JSON file.

A briefing can contain multiple cards, and those cards have an explicit order.

Example:

```text
Mail Agent run
   |
   v
briefing_01JXYZ.json
   |
   +--> card 1
   +--> card 2
   +--> card 3
   +--> card 4
```

The user reviews the cards in that defined order.

A card being swiped away does **not** delete the briefing file.

Only when every card has been reviewed does the application move to a completion step:

```text
Last card reviewed
      |
      v
"Mark this briefing as done?"
      |
   +--+--+
   |     |
  No    Yes
   |     |
   |     v
   |   mark complete
   |     |
   |     v
   |   purge content file
   |     |
   |     v
   |   retain minimal status record
   |
   v
briefing remains active/reviewed
```

### JSON contains briefing content

- briefing ID
- title
- summary
- source
- generation timestamp
- ordered cards
- card content
- card type
- priority
- links
- supporting context
- suggested actions
- source references
- attachment references

### SQLite contains application and lifecycle state

SQLite should contain as little briefing content as possible.

It stores:

- briefing ID
- source ID
- opaque access identifier
- filename while active
- created timestamp
- ingestion timestamp
- current briefing status
- current card position
- per-card review state
- per-card selected action/state
- completion confirmation timestamp
- deletion timestamp
- deletion reason
- schema version
- future Stage 2 agent workflow state

**Do not duplicate title, summary, body, source excerpts, or other sensitive briefing content into SQLite unless a specific feature requires it.**

### Briefing lifecycle

Recommended briefing states:

```text
unread
in_progress
reviewed
completed
deleted
```

Their meaning is:

- `unread`: no card has been reviewed
- `in_progress`: at least one card has been reviewed, but cards remain
- `reviewed`: all cards have been swiped/reviewed, but completion has not yet been confirmed
- `completed`: user explicitly confirmed that the briefing is done
- `deleted`: content purge has completed successfully

`reviewed` and `completed` are deliberately separate states.

Finishing the card stack must **never silently delete content**.

### Completion means briefing-content purge

After the user explicitly confirms completion, the application performs a cascading purge:

1. set the briefing state to `completed`
2. preserve any content-free workflow decisions needed for Stage 2
3. delete the briefing JSON file
4. delete briefing attachments
5. delete cached rendered content
6. delete any full-text search entries
7. delete content-bearing temporary files
8. remove content from notification queues
9. invalidate the cryptic briefing URL
10. set the lifecycle state to `deleted`
11. retain only a minimal non-content status record in SQLite

The remaining status record must be sufficient for a future agent to determine:

- that the briefing existed
- whether the user reviewed it
- whether it was explicitly completed
- whether there are pending follow-up actions
- when completion/deletion happened

It must **not** require retaining the original briefing content.

---

## 5. Data flow

The initial product should support a simple file-based ingestion flow.

```text
briefing.json created
        |
        v
/data/inbox
        |
        v
Briefing Hub detects file
        |
        v
validate against schema
        |
      valid?
      /   \
    no     yes
    |       |
    v       v
/errors   create active briefing
            |
            v
     generate opaque access ID
            |
            v
        index metadata
            |
            v
      move into /active
            |
            v
        user opens briefing
            |
            v
       card 1 -> card 2 -> ...
            |
            v
        final card reviewed
            |
            v
       briefing = reviewed
            |
            v
 "Mark this briefing as done?"
         /          \
       No            Yes
       |              |
       v              v
 remain reviewed   briefing = completed
                      |
                      v
                cascading purge
                      |
                      v
             JSON + attachments +
               caches deleted
                      |
                      v
              briefing = deleted
                      |
                      v
          minimal status remains
```

Recommended directory structure:

```text
/data
├── inbox
├── active
│   ├── 2026
│   │   └── 08
│   │       ├── briefing_01JXYZ.json
│   │       └── briefing_01JXYY.json
├── errors
├── attachments
├── tmp
└── briefing.db
```

There should be **no permanent completed-content archive** by default.

The filesystem inbox is an ingestion mechanism, not a retention mechanism.

---

## 6. Briefing JSON contract

A strict schema should be defined before building the UI.

Each file represents one independently deletable briefing containing an ordered card sequence.

Example:

```json
{
  "schema_version": "1.0",
  "id": "briefing_01JXYZ",
  "title": "Morning Mail Briefing",
  "summary": "4 items need review",
  "source": {
    "id": "mail-agent",
    "name": "Mail Agent"
  },
  "created_at": "2026-08-11T08:15:00+02:00",
  "cards": [
    {
      "id": "card_01",
      "order": 1,
      "type": "information",
      "priority": "medium",
      "title": "Planning update",
      "summary": "A relevant update was found.",
      "body": "Additional context can be placed here."
    },
    {
      "id": "card_02",
      "order": 2,
      "type": "action",
      "priority": "high",
      "title": "Customer requests PP/DS follow-up",
      "summary": "The customer asked whether campaign constraints can be included in the next scheduling demonstration.",
      "body": "Additional context can be placed here.",
      "suggested_actions": [
        {
          "id": "draft-response",
          "label": "Draft response"
        },
        {
          "id": "add-to-prep",
          "label": "Add to customer prep"
        }
      ]
    }
  ]
}
```

### Card ordering

The order must be deterministic.

Preferred rule:

- each card has an integer `order`
- values are unique within the briefing
- the server sorts by `order`
- the frontend is not allowed to reorder cards arbitrarily
- if `order` is omitted in a future schema, array order may be treated as authoritative, but explicit ordering is preferable

This matters because a producer may intentionally structure the briefing as a narrative.

### External access identifier

The server, not the producer, creates the external opaque identifier used in the cryptic briefing URL.

Example:

```text
https://brief.haegens.be/b/7vN4gR2fPq9KxM3c...
```

The source-supplied briefing `id` remains an internal content identifier and is never trusted as an authorization mechanism.

---

## 7. Card model

The swipe interface should not force every item into the same visual or semantic shape.

Cards should have types.

Initial types:

### `information`

Something worth knowing, but no action is expected.

Examples:

- status update
- research finding
- change detected
- task completion report

### `action`

Something that likely requires a user decision or follow-up.

Examples:

- reply needed
- approval requested
- deadline approaching
- task should be added

### `warning`

Something that may require attention because a task failed, data is inconsistent, or something important changed.

### `result`

A completed piece of work.

Examples:

- files changed
- analysis completed
- report created
- agent action completed

### `question`

Reserved for later agent interaction.

The agent has enough context to ask a specific human decision rather than simply reporting information.

---

## 8. Swipe behavior

The swipe system should remain simple.

Do not encode every possible action into gestures.

Recommended behavior:

```text
Swipe left   = reviewed / no follow-up
Swipe right  = reviewed / follow-up needed
Tap          = expand
```

After a swipe, the application advances to the **next card in the briefing's defined order**.

The user should be able to go back before final completion if needed, but normal review is sequential.

When a right swipe occurs, the UI can expose explicit actions.

Example:

```text
Needs action

What should happen?

[ Draft a response ]
[ Add to preparation ]
[ Remind me later ]
[ I'll handle it ]
```

This is better than trying to use four swipe directions for four unrelated meanings.

Gestures should handle triage.

Buttons should handle decisions.

### Final-card behavior

After the final card has been swiped:

```text
All cards reviewed

[ Review again ]

This briefing has no remaining cards.

Mark this briefing as done?
Its briefing content will be deleted from the server.

[ Keep briefing ]   [ Mark done & delete ]
```

Important behavior:

- deletion is never triggered merely by swiping the last card
- completion requires an explicit confirmation
- `Keep briefing` leaves the briefing in `reviewed`
- `Mark done & delete` transitions it through `completed` to `deleted`
- future Stage 2 actions selected during review are retained as content-free workflow state
- the deleted briefing URL must no longer return the content

This is the key human control point in the lifecycle.

---

## 9. Main application views

### 9.1 Inbox

The home screen.

Example:

```text
Good morning

12 unread cards

TODAY

Mail Agent                 7
08:12

Demo Builder               2
07:54

RFP Review                 3
Yesterday

[ START BRIEFING ]
```

The user can either open an individual briefing or start a combined briefing session.

---

### 9.2 Briefing session

All unread cards can be merged into one stack.

```text
             4 / 12

      +------------------+
      | MAIL AGENT       |
      | HIGH PRIORITY    |
      |                  |
      | Customer asks... |
      |                  |
      | Read more        |
      +------------------+

      Seen <-     -> Action
```

The app should remember position if the session is interrupted.

---

### 9.3 Expanded card

Tapping a card opens the complete content without losing the current stack position.

This view can contain:

- full body
- source
- timestamps
- tags
- attachments
- links
- source excerpts
- explicit actions

---

### 9.4 Briefing history

Past briefings remain searchable and accessible.

Filters should eventually include:

- source
- date
- card type
- priority
- status
- tag

---

### 9.5 Agent/source overview

Even before agents are interactive, every briefing has a source.

Example:

```text
Mail Agent
Last briefing: 08:12
Unread: 3
Total this week: 41

Demo Builder
Last briefing: Yesterday
Unread: 0
Total this week: 6
```

This later becomes the natural place to display agent health and execution state.

---

## 10. Server API

The first release can remain mostly read-oriented while keeping the API ready for later interaction.

### Briefings

```text
GET /api/briefings
GET /api/briefings/:briefingId
GET /api/briefings/:briefingId/cards
```

### Cards

```text
GET  /api/cards
GET  /api/cards/:cardId
POST /api/cards/:cardId/review
POST /api/cards/:cardId/action
```

Card review updates state only. It does not delete the briefing content.

### Briefing completion

```text
POST /api/briefings/:briefingId/complete
GET  /api/briefings/:briefingId/status
```

`POST /complete` should:

1. verify that all cards are reviewed
2. verify explicit user confirmation
3. persist any Stage 2 workflow state
4. perform the cascading purge
5. return only non-content completion metadata

### Sessions

```text
POST /api/sessions
GET  /api/sessions/:sessionId
PUT  /api/sessions/:sessionId
```

A session stores where the user is in a briefing stack.

### Health

```text
GET /api/health
```

Example:

```json
{
  "status": "ok",
  "database": "ok",
  "storage": "ok",
  "version": "0.1.0"
}
```

---

## 11. Future interaction API

These endpoints do not need to be implemented in the first release, but the architecture should reserve for them.

```text
POST /api/cards/:cardId/decision

GET  /api/agents/:agentId/inbox
GET  /api/agents/:agentId/work
GET  /api/briefings/:briefingId/status
POST /api/agents/:agentId/results

POST /api/briefings
POST /api/events
```

Later, a user decision might produce:

```json
{
  "card_id": "card_01",
  "action_id": "draft-response",
  "created_at": "2026-08-11T09:04:32+02:00",
  "status": "pending"
}
```

An agent can consume it later.

After processing:

```json
{
  "status": "completed",
  "result": "Draft response created."
}
```

That can itself become a new `result` card.

### Stage 2 must not depend on deleted content

A future agent should be able to poll the Briefing Hub and ask:

```text
Do I have any completed briefings with pending follow-up work?
```

The Hub can answer from content-free workflow state.

Example:

```json
{
  "briefing_id": "briefing_01JXYZ",
  "status": "deleted",
  "reviewed": true,
  "completed": true,
  "pending_actions": [
    {
      "action_id": "draft-response",
      "card_id": "card_02",
      "status": "pending"
    }
  ],
  "completed_at": "2026-08-11T09:31:00+02:00"
}
```

The actual briefing text is no longer present.

This gives Stage 2 a clean separation:

```text
Stage 1
briefing content -> human review -> explicit completion -> content deletion

Stage 2
content-free workflow state -> agent checks work queue -> agent acts -> result status
```

If an agent later needs original source context to perform an action, it should retrieve that context again from the authorised source system rather than rely on the deleted briefing content.

---

## 12. Later agent loop

The final architecture should support this without redesigning the Briefing Hub.

```text
Source system
     |
     v
AI agent
     |
     | publish briefing
     v
Briefing Hub
     |
     v
User
     |
     | decision
     v
Briefing Hub
     |
     | pending work
     v
AI agent
     |
     | result
     v
Briefing Hub
```

The Hub therefore becomes more than a report viewer.

It becomes the human interaction layer between autonomous processes and the user.

---

## 13. Security, privacy and compliance posture

Security must be part of the product architecture, not an optional deployment layer.

The application should assume that any briefing can contain:

- personal data
- work email content
- customer names
- internal business information
- meeting information
- confidential recommendations
- source-system links
- attachments

The target is not to claim blanket "GDPR compliance" from technical controls alone. Compliance depends on the actual processing purpose, organisation, legal basis, retention obligations, processor relationships and policies.

The application should instead implement strong **privacy-by-design, data-minimisation, storage-limitation and security-by-default controls** so that it can be operated compliantly.

### 13.1 Defence in depth

Recommended access path:

```text
iPhone
   |
HTTPS only
   |
Cloudflare / access gateway
   |
authenticated user
   |
Cloudflare Tunnel
   |
Nginx Proxy Manager
   |
Briefing Hub
   |
opaque briefing authorization check
   |
active briefing
```

A cryptic URL is an additional layer, not the primary authentication mechanism.

### 13.2 Cryptic per-briefing links

Each briefing receives a non-sequential, cryptographically random external identifier.

Example shape:

```text
https://brief.haegens.be/b/7vN4gR2fPq9KxM3c...
```

Requirements:

- generated by the server using a cryptographically secure random generator
- sufficiently high entropy to make guessing impractical
- unrelated to the source item ID
- unrelated to customer names, titles, dates or agent names
- never sequential
- invalidated immediately when the briefing is completed and its content is deleted
- rate-limit repeated failed lookups
- return the same generic response for missing, expired and unauthorized items where practical

**The cryptic path is not enough on its own.**

The normal model should still require an authenticated session before content is returned.

This gives two independent requirements for successful access:

```text
valid authenticated session
            +
valid opaque briefing identifier
            =
briefing content
```

### 13.3 Do not put long-lived secrets in URLs

Do not use a permanent bearer API key, session token or long-lived authorization secret in the URL.

URLs can appear in browser history, proxy logs, server logs and referrer information.

If a future "magic link" feature is required:

1. create a short-lived, single-use token
2. store only a hash of that token server-side
3. use HTTPS
4. exchange the token immediately for a restricted secure session
5. invalidate the token on first successful use
6. replace the browser URL with a clean URL after exchange
7. do not log token-bearing request data
8. apply rate limiting and expiry

For the normal personal briefing flow, authenticated access plus an opaque item URL is preferable.

### 13.4 Session security

Use a proven authentication/access solution rather than inventing authentication logic.

Application sessions should use:

- `Secure` cookies
- `HttpOnly` cookies
- appropriate `SameSite` policy
- short idle timeout
- server-side invalidation
- CSRF protection for state-changing requests
- re-authentication for security-sensitive administration where appropriate

Do not store session secrets in `localStorage`.

### 13.5 HTTPS only

All access must use HTTPS.

Plain HTTP should redirect to HTTPS at the outermost layer or be unavailable entirely.

Internal service exposure should be limited to the required reverse-proxy network.

The Briefing Hub should not expose its application port directly to the public internet.

### 13.6 Encryption at rest

Briefing content should be protected at rest.

Preferred layers:

1. encrypted host/storage volume
2. encrypted backups
3. optionally application-level encryption for briefing JSON and attachments

If application-level encryption is implemented:

- use authenticated encryption
- keep encryption keys outside the briefing data volume
- support key rotation
- never write decrypted content into logs or persistent temporary files

### 13.7 No third-party content leakage

The briefing UI should not depend on external analytics, advertising, remote fonts, third-party trackers or unnecessary third-party scripts.

Prefer serving application assets locally.

This reduces the number of external parties that can observe access metadata and simplifies the privacy boundary.

### 13.8 Security headers

Set restrictive HTTP security headers, including:

- Content Security Policy
- `frame-ancestors` / anti-clickjacking protection
- HSTS
- `X-Content-Type-Options: nosniff`
- strict Referrer Policy
- appropriate Permissions Policy

The CSP should avoid arbitrary inline script execution where practical.

### 13.9 Prevent indexing and caching

Briefing content must not be discoverable by search engines.

Use:

```text
X-Robots-Tag: noindex, nofollow, noarchive
```

and a restrictive `robots.txt` as an additional signal.

Sensitive API responses should use cache controls that prevent unintended shared/proxy caching.

Authentication and authorization remain required even with these controls.

### 13.10 Logging minimisation

Application and reverse-proxy logs must not contain briefing content.

Avoid logging:

- titles
- body text
- email excerpts
- attachment contents
- access tokens
- session IDs
- secret links/tokens
- query parameters containing secrets
- personal data unless operationally necessary

Prefer:

- request ID
- endpoint template
- response status
- timing
- internal opaque item ID or hashed correlation identifier

Logs require their own retention period and access controls.

### 13.11 Input and rendering security

Every incoming item must be treated as untrusted input, including items created by trusted AI agents.

Requirements:

- strict JSON Schema validation
- maximum item size
- maximum attachment size
- maximum card/body lengths
- allow-listed card types
- validated URLs
- sanitized Markdown rendering
- no arbitrary HTML
- no script execution from briefing content
- path traversal protection
- MIME validation for attachments
- no direct filesystem paths exposed to the client

### 13.12 Least privilege

The application process should:

- run as a non-root user
- only have write access to required data directories
- have no unnecessary host mounts
- have no Docker socket access
- have no SSH keys it does not require
- have no source-system credentials in the web frontend
- use separate future credentials per agent/publisher

### 13.13 Data deletion on briefing completion

Swiping cards is review activity and must not itself delete content.

Only the explicit **Mark done & delete** confirmation after all cards have been reviewed initiates deletion.

The server must perform a transactional or retryable cascading purge.

Target result:

```text
Briefing JSON               DELETED
Briefing attachments        DELETED
Rendered/cache copies       DELETED
Search-index content        DELETED
Temporary processing files  DELETED
Cryptic access grant        INVALIDATED
Pending notification body   DELETED
SQLite content fields       DELETED / never stored
Workflow/action state       RETAINED if required
Minimal status tombstone    RETAINED
```

The UI should not display the old content after successful completion, including through browser refresh, history navigation or API retries.

The old opaque briefing URL must return the chosen generic unavailable response after purge.

Any retained Stage 2 workflow information must be content-minimised and must not become a hidden copy of the deleted briefing.

### 13.14 Minimal tombstone

After content deletion, retain only what is necessary for safe operation.

Example:

```json
{
  "internal_id": "briefing_01JXYZ",
  "status": "deleted",
  "completed_at": "2026-08-11T09:31:00+02:00",
  "deleted_at": "2026-08-11T09:31:01+02:00",
  "schema_version": "1.0"
}
```

Do not retain:

- title
- summary
- body
- tags containing personal information
- customer
- sender
- recipient
- source excerpt
- attachment name where sensitive
- original URL
- generated recommendation

If even the remaining metadata is not required for a defined purpose, it should also have a retention limit.

### 13.15 Backups and deletion

Deleting the live JSON file is not sufficient if the same content remains indefinitely in backups.

Backups therefore need a documented retention model.

Recommended approach:

- encrypted backups
- short, explicit backup retention
- automatic expiry
- no permanent historical snapshots of briefing content
- deletion from the live system immediately on completion
- expired backups destroyed automatically
- documented restore procedure that re-applies tombstones/deletions so restored data does not resurrect completed items

The last point is important: restoring an old backup must not silently bring previously deleted briefing content back into active use.

### 13.16 Data retention policy

Default active-content policy:

```text
Incomplete briefing -> retained while needed
Reviewed briefing   -> retained until user confirms completion
Completed briefing  -> immediate active-content purge
Invalid briefing    -> short diagnostic retention, then purge
Temporary file  -> purge immediately after processing
Logs            -> short fixed retention
Backups         -> fixed encrypted retention
Tombstones      -> fixed minimal retention, then purge if no longer needed
```

Retention values should be configuration, not hard-coded application assumptions.

### 13.17 Data protection principles mapped to the product

The technical design should support:

**Purpose limitation**  
Briefing data is processed to present and review briefing items, not silently repurposed.

**Data minimisation**  
Store only the content required to brief the user.

**Storage limitation**  
Completed briefing content is deleted instead of kept forever.

**Integrity and confidentiality**  
Authentication, authorization, HTTPS, secure storage, restrictive networking and validation protect the content.

**Data protection by design and by default**  
The secure/private behaviour should be the default configuration, not something the operator must remember to enable later.

**Accountability**  
Configuration, retention policy, deletion behaviour and security controls should be documented and testable.

These principles align the technical architecture with the GDPR's core data-protection principles and security-of-processing requirements. They do not by themselves establish legal compliance for every possible use of the system.

### 13.18 Compliance documentation to keep with the project

Create a small `/docs/compliance` directory containing:

```text
/docs/compliance
├── data-flow.md
├── data-inventory.md
├── retention-policy.md
├── deletion-policy.md
├── access-control.md
├── backup-policy.md
├── incident-response.md
├── threat-model.md
└── processor-inventory.md
```

This is useful both for disciplined engineering and for demonstrating how the system is intended to process and protect data.

---

## 14. Why validation matters

The server should never assume generated JSON is correct.

Every document should be validated against `briefing.schema.json`.

Validation should check:

- required properties
- correct types
- supported `schema_version`
- unique briefing ID
- unique card IDs within a briefing
- valid card type
- valid priority
- maximum string lengths
- maximum number of cards
- safe URLs
- valid timestamps
- no unexpected HTML/script payloads
- no producer-controlled authorization tokens
- no filesystem paths
- attachment allow-list and limits

An invalid briefing is not partially rendered.

It moves to `/data/errors` and receives a clear validation report.

Example:

```text
briefing_01JXYZ.json

INVALID

cards[4].priority:
"urgentish" is not one of:
low, medium, high, critical
```

This becomes especially important once AI agents generate the files.

---

## 15. Version the schema from the beginning

Every briefing starts with:

```json
{
  "schema_version": "1.0"
}
```

The renderer understands schema versions.

Future versions can add fields without breaking historical content.

Example:

```text
1.0   basic cards
1.1   attachments
1.2   action forms
2.0   conversation / agent workflow
```

Avoid silently changing the meaning of fields in an existing schema version.

---

## 16. Markdown inside cards

The `body` field can support a restricted Markdown subset.

Useful elements:

- paragraphs
- bold
- italic
- bullets
- numbered lists
- code
- links
- small headings
- block quotes

Avoid arbitrary HTML from briefing JSON.

Render Markdown using a sanitised parser.

This gives agents enough expressive power without allowing a generated document to inject arbitrary scripts into the application.

---

## 17. Attachments

Do not embed large binary data in JSON.

A card can reference attachments.

Example:

```json
{
  "attachments": [
    {
      "id": "att_01",
      "type": "pdf",
      "name": "customer-request.pdf",
      "path": "/attachments/att_01"
    }
  ]
}
```

The server owns attachment storage and access control.

Later, an ingestion endpoint can receive multipart uploads.

---

## 18. Notifications

Notifications should not be required for version one.

The PWA inbox is the source of truth.

Later options:

- web push notification
- email summary
- mobile home-screen badge
- notification only for `critical`
- morning digest

Avoid notifying for every card.

The product should reduce attention fragmentation, not create another noisy notification source.

---

## 19. PWA behavior

The React application should be installable on iPhone.

Expected behavior:

- home-screen icon
- standalone full-screen presentation
- cached application shell
- recent briefing metadata available during temporary connection loss
- resume current briefing session
- normal HTTPS web deployment
- no App Store required

The server remains the source of truth.

Offline behavior should be treated as convenience, not as a second storage system.

---

## 20. Deployment on the existing homelab

A clean deployment would be a dedicated Briefing Hub container or VM workload.

The current reverse-proxy architecture can remain the front door.

Recommended request path:

```text
brief.haegens.be
       |
Cloudflare Tunnel
       |
Nginx Proxy Manager
       |
briefing-hub:8080
```

The application itself only needs one exposed internal HTTP port.

Example Docker Compose shape:

```yaml
services:
  briefing-hub:
    image: briefing-hub:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
```

The frontend build can be served directly by the Fastify application.

That avoids running separate frontend and backend containers without a strong reason.

---

## 21. Suggested repository structure

```text
briefing-hub/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── api/
│   │   │   ├── ingestion/
│   │   │   ├── storage/
│   │   │   ├── validation/
│   │   │   └── server.ts
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── api/
│       │   └── app.tsx
│       └── package.json
│
├── packages/
│   └── briefing-schema/
│       ├── briefing.schema.json
│       ├── types.ts
│       └── examples/
│
├── data/
│   ├── inbox/
│   ├── briefings/
│   ├── attachments/
│   └── errors/
│
├── docker-compose.yml
├── Dockerfile
└── README.md
```

A shared schema package means the frontend, backend, test fixtures, and later agent publishers all use the same contract.

---

## 22. Ingestion strategies

The product can support multiple ingestion mechanisms over time.

### Version 1: filesystem inbox

```text
/data/inbox/*.json
```

Simple, local, easy to debug.

### Version 2: authenticated API

```text
POST /api/briefings
Authorization: Bearer <agent-token>
```

The server:

1. authenticates producer
2. validates payload
3. writes immutable JSON
4. indexes it
5. returns briefing ID

### Version 3: event-driven integration

Later, source-specific services or agents can publish through the API whenever work finishes.

No change to the frontend is necessary.

---

## 23. IDs

Do not use filenames or human-readable titles as identifiers.

Use generated IDs such as UUIDv7 or ULID.

Example:

```text
briefing_01K28JH1Z4...
card_01K28JH4N7...
```

Useful properties:

- unique
- safe in URLs
- sortable by creation time when using ULID/UUIDv7
- independent of title
- independent of agent

---

## 24. State model

A briefing can have:

```text
unread
in_progress
reviewed
archived
```

A card can have:

```text
unread
seen
needs_action
resolved
dismissed
```

Later a decision can have:

```text
pending
claimed
processing
completed
failed
cancelled
```

Keeping these concepts separate will matter once agent interaction starts.

---

## 25. Combined briefing sessions

One of the strongest features should be the ability to combine cards from multiple briefings.

Example:

```text
Mail Agent             5 unread
Demo Builder           2 unread
Research Agent         3 unread
--------------------------------
Morning briefing      10 cards
```

The stack is assembled dynamically.

It should not generate a new duplicated briefing document.

A `session` simply stores a query and progress.

Example:

```json
{
  "id": "session_01",
  "created_at": "2026-08-11T09:00:00+02:00",
  "filters": {
    "status": "unread"
  },
  "card_ids": [
    "card_1",
    "card_2",
    "card_3"
  ],
  "current_index": 1
}
```

---

## 26. Search

Search is not required before the core review flow works, but the data model should permit it.

SQLite FTS is sufficient for this product.

Potential searchable fields:

- title
- summary
- body
- source
- tags
- attachment names

There is no need for a vector database simply to search briefing history.

Semantic search can be added later if there is a real use case.

---

## 27. Product principles

### One presentation layer

Agents never design their own interface.

### Structured data first

The contract is JSON, not generated HTML.

### Human attention is scarce

The system should prioritise and triage instead of maximising the number of cards.

### Immutable while active, purge when complete

An active briefing item is immutable content. User/workflow state lives separately. When the item is completed, the content is purged rather than permanently archived.

### Explicit decisions

Swipes help triage. Important decisions use buttons and forms.

### Agent-independent

Nothing about the server should require Claude Code specifically.

Any future agent framework can publish the same briefing format.

### Local-first infrastructure

The system can run entirely on the existing self-hosted infrastructure.

### Upgrade without migration pain

Schema versioning, stable IDs, and API separation should exist from version one.

---

## 28. What should not be built yet

Avoid premature complexity.

Do not start with:

- multi-user organisations
- role-based permissions
- PostgreSQL
- Redis
- message queues
- Kubernetes
- native iOS application
- vector database
- agent scheduler
- autonomous action execution
- agent-to-agent communication
- chat interface
- complex workflow designer

None of these is required to prove the core product.

---

## 29. First viable product

The first genuinely useful release should include:

1. Dockerised Briefing Hub server
2. React mobile web application
3. PWA manifest and home-screen support
4. JSON Schema
5. `/data/inbox` ingestion
6. schema validation
7. immutable briefing archive
8. SQLite metadata database
9. briefing inbox
10. briefing detail page
11. swipeable card session
12. read / seen / needs-action state
13. combined unread briefing
14. history
15. authentication
16. cryptic per-briefing opaque URLs
17. HTTPS
18. secure session cookies and CSRF protection
19. restrictive security headers
20. no-index / no-archive response policy
21. explicit briefing-completion-triggered cascading content deletion
22. minimal deletion tombstones
23. encrypted, retention-limited backups
24. log minimisation
25. health endpoint
26. sample briefing generator
27. error view for invalid documents

That is already a complete product rather than a prototype webpage.

---

## 30. Suggested implementation order

### Phase 1: contract

Build:

- briefing JSON Schema
- TypeScript types generated or derived from the schema
- example briefings
- validation tests

Do this before the interface.

### Phase 2: backend

Build:

- Fastify server
- SQLite database
- storage abstraction
- ingestion watcher
- validation
- API
- health endpoint

### Phase 3: basic frontend

Build:

- inbox
- briefing page
- card page
- history
- API client

### Phase 4: briefing interaction

Build:

- card stack
- swipe gestures
- resume session
- read state
- needs-action state
- combined briefing

### Phase 5: mobile product

Build:

- PWA
- iPhone home-screen layout
- offline app shell
- touch tuning
- loading states
- polished animations

### Phase 6: production deployment

Build:

- Docker image
- persistent data volume
- reverse proxy route
- HTTPS
- authentication
- backups
- logging
- upgrade procedure

### Phase 7: agent integration later

Add:

- authenticated publishing API
- per-agent credentials
- action/decision queue
- agent inbox
- result reporting
- agent status
- scheduled or event-driven execution

---

## 31. Definition of done for server-side V1

The server-side component is viable when all of the following work:

- dropping a valid JSON file into `/data/inbox` makes it appear in the application
- invalid JSON is rejected with a readable error
- an incomplete item survives application restart
- operational metadata is indexed in SQLite without unnecessary content duplication
- active JSON never needs to be regenerated after a UI change
- the same API can render one logical briefing or a combined briefing
- review state persists
- every active briefing has an unguessable opaque URL
- authentication is still required before briefing content is returned
- completing an item deletes its JSON, attachments, caches and search copies
- a completed item's old URL can no longer retrieve content
- deletion survives backup restoration through tombstone/reconciliation logic
- the UI works comfortably on an iPhone
- the application can be installed as a PWA
- authentication protects all briefing content
- the application is reachable only through HTTPS
- sensitive content is absent from application/proxy logs
- backups are encrypted and retention-limited
- the `/data` directory can be backed up and restored safely
- a future agent can publish through an API without changing the briefing format

---

## 32. Security and privacy reference baseline

The implementation should be reviewed against, at minimum:

- GDPR Article 5 principles, including data minimisation, storage limitation, integrity/confidentiality and accountability
- GDPR Article 25 data protection by design and by default
- GDPR Article 32 security of processing
- EDPB practical guidance on storage limitation and secure processing
- OWASP guidance for authentication, session management, REST security, cryptographic randomness, logging and HTTP security headers

The GDPR requires personal data to be kept no longer than necessary for the processing purpose, and the EDPB explicitly recommends defined retention periods and deletion/anonymisation procedures. Security measures must be appropriate to the risk and processing context.

This document is a technical architecture, not a legal determination that any particular deployment is compliant. Organisational policies, lawful basis, processor agreements, source-system permissions and applicable employer/customer rules must be assessed separately.

---

## 33. Long-term target

The final product can evolve into a personal agent control plane.

```text
                    BRIEFING HUB

   Producers                           Human
      |                                  |
      |                                  |
Mail Agent --------\                     |
Demo Agent ---------\                    |
RFP Agent -----------+--> Briefings --> iPhone
Research Agent ------/                    |
Other tools --------/                     |
                                         |
                                         v
                                      Decisions
                                         |
                                         v
                                     Work queue
                                         |
                   /---------------------+----------------\
                   |                     |                |
                   v                     v                v
               Mail Agent          Demo Agent        Other agent
                   |                     |                |
                   \---------------------+----------------/
                                         |
                                         v
                                       Results
```

The crucial point is that the Briefing Hub should be useful **before** any of that automation exists.

Version one is already a good application:

> Put structured briefing documents into one place, present their cards in a deliberate order, make them easy to review on a phone, explicitly confirm when a briefing is done, delete its content, and preserve only the minimal workflow state required for future actions.

Later, agents become producers and consumers of the same platform.

---

## 34. Stage 1 versus Stage 2 boundary

The product should be deliberately split into two stages.

### Stage 1: Briefing

Stage 1 is the product being built now.

Responsibilities:

- ingest briefing JSON
- validate it
- host it securely
- provide a cryptic briefing URL
- authenticate the user
- render ordered cards
- persist review progress
- capture basic card dispositions
- ask for explicit completion after the final card
- delete briefing content after confirmation
- retain minimal status/workflow metadata

Stage 1 does **not** need to run autonomous agents.

### Stage 2: Agent interaction

Stage 2 can be added later.

Responsibilities may include:

- agents publishing briefings through an API
- agents polling for completed briefings
- agents polling for pending follow-up actions
- agents consuming user decisions
- agents claiming work
- agents reporting completion/failure
- producing follow-up result briefings
- agent health/status monitoring

The key architectural rule is:

> Stage 2 may depend on Stage 1's status and workflow metadata, but it must not require Stage 1 to retain completed briefing content.

This keeps the privacy/deletion model intact while still allowing meaningful back-and-forth.

---

## 35. Recommended first engineering task

Start with the schema and three deliberately different example briefings:

1. **Morning mail briefing**
   - mixture of information and actions
   - 8 to 12 cards

2. **Task completion briefing**
   - what changed
   - files created
   - warnings
   - next steps

3. **Research briefing**
   - key findings
   - supporting links
   - implications
   - items worth saving

If one JSON model can represent all three cleanly without UI-specific hacks, the contract is probably strong enough to begin building the backend.

The next implementation target should then be:

```text
JSON file
   ->
validation
   ->
SQLite index
   ->
GET /api/briefings
   ->
React inbox
```

Once that vertical slice works, the swipe interface can be added on top without changing the underlying architecture.
