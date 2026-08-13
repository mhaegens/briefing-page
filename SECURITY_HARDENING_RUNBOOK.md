# Briefing Hub Security Hardening Runbook

**Service:** `https://brief.haegens.be`  
**Audience:** Owner, deployer, and future maintainers  
**Created:** 12 August 2026  
**Current classification:** Not approved for confidential data until the Phase 0 acceptance checks pass

## 1. Objective

Briefing Hub temporarily stores material that may be confidential. The required access model is:

- the web UI is visible and usable only by the owner;
- the private read and mutation APIs are usable only by the owner through the UI;
- approved agents may publish to exactly `POST /api/ingest`, but cannot list, read, change, or delete briefings;
- the application fails closed if authentication is missing or misconfigured;
- the origin cannot be reached by bypassing Cloudflare;
- stored content, logs, backups, and deletion behavior are handled as confidential data.

“Owner only” describes application access. A server administrator or anyone controlling the host, backup system, Cloudflare account, Coolify account, identity provider, or encryption keys may still be technically capable of accessing data. Those administrative accounts must therefore also be owner-controlled and protected with MFA.

## 2. Current state and risk

On 12 August 2026, unauthenticated requests to the following live routes returned `200 OK`:

- `/`
- `/api/briefings`
- `/api/sources`
- `/api/health`

The response bodies were not retained or inspected during the audit. The status checks alone establish that the expected Cloudflare Access challenge was not active.

The application currently checks `BRIEFING_HUB_API_KEY` only on `POST /api/ingest`. These routes do not contain an application-level authorization check:

- `GET /api/briefings`
- `GET /api/briefings/:slug`
- `GET /api/sources`
- `PATCH /api/cards/:id`
- `POST /api/briefings/:slug/complete`

This means the bearer token protects publishing, not reading or operating the UI. The browser client also does not send that bearer token, and it must not be embedded in browser JavaScript because any visitor could extract it.

Additional important findings:

- `next@15.3.4` and `react@19.0.0` are affected by a critical unauthenticated React Flight/Next.js RCE advisory. The production dependency audit reported one critical and two high vulnerability groups.
- The README currently recommends bypassing Cloudflare Access for `/api/*`. That would exempt every confidential and destructive API from the owner login and must not be used.
- Successfully ingested file-drop payloads are moved to `/data/processed` and retained. Failed payloads remain in `/data/failed`.
- Nulling database columns does not by itself guarantee removal from SQLite free pages, WAL files, snapshots, or backups.
- The live responses lack explicit confidential caching, indexing, anti-framing, referrer, permissions, and content security policies.
- The container runs as root and binds the application to all interfaces. Direct origin reachability has not yet been ruled out.
- Request size, cards per briefing, and several text fields are insufficiently bounded.

Until Phase 0 is complete, do not upload new confidential material. Previously stored material should be treated as potentially exposed; public accessibility does not by itself prove that anyone accessed it.

## 3. Target architecture

```text
Owner browser
    |
    | HTTPS + Cloudflare Access owner session
    v
Cloudflare Access: exact owner identity only
    |
    | signed Access assertion
    v
Cloudflare Tunnel with Access token validation
    |
    v
Briefing Hub
    |-- server-side owner check on UI and every private API
    |-- no public read, mutation, or deletion endpoints
    v
Encrypted /data volume and encrypted, short-retention backups

Approved agent
    |
    | Cloudflare service-token headers
    | Authorization: Bearer <per-agent publishing token>
    v
POST /api/ingest only
```

The controls are intentionally layered. Cloudflare is the first gate, origin isolation prevents edge bypass, and application authorization limits the consequences of a proxy or routing mistake.

## 4. Access-control matrix

| Route | Owner browser | Approved agent | Unauthenticated outsider |
|---|---:|---:|---:|
| `/` and UI assets | Allow after owner login | Deny | Deny before application HTML is returned |
| `GET /api/briefings` | Allow | Deny | Deny |
| `GET /api/briefings/:slug` | Allow | Deny | Deny |
| `GET /api/sources` | Allow | Deny | Deny |
| `PATCH /api/cards/:id` | Allow | Deny | Deny |
| `POST /api/briefings/:slug/complete` | Allow | Deny | Deny |
| `POST /api/ingest` | Optional/deny | Allow with both service token and publishing token | Deny |
| `/api/health` | Not needed publicly | Internal health checker only | Deny at Cloudflare |

Static UI assets do not contain briefing content, but the entire hostname should still be behind Access so outsiders cannot load or use the UI shell.

## 5. Phase 0 — Immediate containment

**Goal:** stop public access before any other work. This phase is a deployment configuration change and should be completed immediately.

### 5.1 Cloudflare Access owner application

In Cloudflare Zero Trust:

1. Create a **Self-hosted** Access application for the complete hostname `brief.haegens.be`.
2. Cover the root and all paths. Do not protect only the homepage.
3. Add one owner policy:
   - Action: `Allow`
   - Include: the owner’s exact email address
   - Do not use `Everyone`, “all valid emails,” or the complete email domain
   - Require the chosen identity provider and MFA
4. Prefer one owner-controlled identity provider and enable instant authentication.
5. Set a short session lifetime, initially eight hours or less.
6. Remove all `Bypass` policies applying to `/api/*`, `/*`, or the hostname.
7. Leave Access deny-by-default for every identity that does not match the exact owner policy.
8. Protect the Cloudflare account itself with phishing-resistant MFA where possible and store recovery codes securely.

If Access cannot be enabled immediately, stop the application in Coolify until it can be configured.

### 5.2 Dedicated agent-ingestion application

Create a second, more specific Access application for exactly:

```text
brief.haegens.be/api/ingest
```

Configure it as follows:

- Action: `Service Auth`
- Include: only explicitly created Cloudflare Access service tokens
- Do not use `Bypass`
- Create a separate service token per agent or publishing system where practical
- Give service tokens a defined expiry and document their owner

Agents must send all three credentials:

```http
CF-Access-Client-Id: <service-token-client-id>
CF-Access-Client-Secret: <service-token-client-secret>
Authorization: Bearer <briefing-publishing-token>
```

Do not configure Cloudflare’s single-header service-token mode on the `Authorization` header because the application already uses that header for its publishing bearer token.

The service token authorizes the request through Cloudflare. The application bearer token separately authorizes publishing. Neither credential grants access to the private read or mutation endpoints.

Reference documentation:

- <https://developers.cloudflare.com/cloudflare-one/access-controls/policies/>
- <https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/>
- <https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/>

### 5.3 Rotate credentials

After Access is active:

1. Generate a new high-entropy `BRIEFING_HUB_API_KEY` using a password manager or a cryptographically secure generator.
2. Update it in the Coolify secret/environment configuration.
3. Update only the approved publishers.
4. Redeploy, verify the new key, and revoke the old key.
5. Rotate any Cloudflare service token that may have been copied into an insecure location.
6. Do not place tokens in Git, briefing JSON, URLs, shell history, screenshots, or ordinary documentation.

### 5.4 Phase 0 acceptance checks

Run these from a logged-out/incognito browser and from a machine without an Access session:

```bash
curl -i https://brief.haegens.be/
curl -i https://brief.haegens.be/api/briefings
curl -i https://brief.haegens.be/api/sources
```

Acceptable results are an Access login redirect or an Access denial. None of the responses may contain application HTML, briefing titles, sources, slugs, cards, or JSON data.

Then verify:

- the exact owner identity can log in and use the UI;
- a different valid identity is denied;
- an agent request without Cloudflare service credentials is denied at the edge;
- an agent request with service credentials but no valid bearer token receives an application `401`;
- an agent request with the bearer token but no Cloudflare service credentials is denied at the edge;
- an agent request with both credentials can ingest successfully;
- that agent cannot use its credentials to read `/api/briefings` or any other private route.

Record the date, tester, and results. Phase 0 is not complete until all checks pass.

## 6. Phase 1 — Patch the vulnerable runtime

Upgrade and redeploy before restoring confidential use:

- Upgrade Next.js from `15.3.4` to at least `15.5.23`, or a later supported patched release after compatibility testing.
- Upgrade `eslint-config-next` to the matching version.
- Upgrade React and React DOM from `19.0.0` to a patched compatible version, at least `19.0.8` if staying on the React 19.0 line.
- Regenerate and commit the lock file.
- Rebuild the Docker image from scratch rather than reusing old layers.
- Run the complete build, typecheck, lint, tests, and production dependency audit.

Required commands:

```bash
npm run typecheck
npm run lint
npm test --if-present
npm run build
npm audit --omit=dev
```

Acceptance criteria:

- no high or critical production dependency advisory remains;
- the production image contains the expected patched versions;
- the UI and ingestion flow work behind Access;
- authentication is retested after the framework upgrade.

Relevant advisory: <https://github.com/advisories/GHSA-9qr9-h5gf-34mp>

## 7. Phase 2 — Application-level authorization

Cloudflare Access must not be the only confidentiality boundary.

### 7.1 Owner identity validation

Implement a server-side authorization helper that:

1. reads Cloudflare’s signed Access assertion;
2. validates its signature using Cloudflare’s published keys;
3. validates issuer, audience, expiry, and not-before claims;
4. verifies that the authenticated email exactly equals `BRIEFING_HUB_OWNER_EMAIL`;
5. returns a generic `401` or `403` without revealing route data;
6. fails closed if any required environment variable, key retrieval, or validation step fails.

Required environment values should include:

```text
BRIEFING_HUB_OWNER_EMAIL=<exact owner email>
CLOUDFLARE_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUDIENCE=<application audience tag>
```

Do not authorize based only on an unsigned email header. A direct-origin attacker can forge ordinary headers. The existing `app/chatgpt-auth.ts` helper trusts OpenAI-hosting headers and is not a suitable authentication boundary for this self-hosted deployment.

### 7.2 Protect every route in the handler

Call the owner authorization helper inside every confidential route handler:

- `GET /api/briefings`
- `GET /api/briefings/:slug`
- `GET /api/sources`
- `PATCH /api/cards/:id`
- `POST /api/briefings/:slug/complete`

Do not rely only on Next.js middleware/proxy matching. Direct checks in each handler provide a second boundary and reduce the impact of routing or middleware bypasses.

`POST /api/ingest` must continue to validate a publishing token. Replace a normal string equality check with a length-safe, constant-time comparison and move toward per-agent hashed tokens with identifiers, expiry, last-used time, and revocation.

### 7.3 Protect the UI response itself

The current page is a static client component. Refactor it so the server authorizes the request before returning the application UI:

1. move the existing client UI into a dedicated client component;
2. make `app/page.tsx` a server component;
3. call the server-side owner authorization helper in `app/page.tsx`;
4. render the client component only after authorization succeeds;
5. force the owner page to be dynamic and non-cacheable.

Cloudflare should normally intercept an outsider first. The server check ensures that an outsider who somehow reaches the origin still does not receive or use the UI.

### 7.4 Local development

Development authentication must be explicit and fail closed:

- production must refuse to start if owner-auth configuration is absent;
- any local auth bypass must require an explicit development-only setting;
- a development bypass must never activate when `NODE_ENV=production`;
- local development should bind to loopback, not the LAN, unless deliberately protected.

### 7.5 CSRF and cross-origin controls

For `PATCH` and `POST` UI operations:

- accept only `Content-Type: application/json`;
- validate `Origin` and `Host` against `https://brief.haegens.be`;
- reject missing or foreign origins on browser mutation requests;
- require a custom CSRF header or a server-issued CSRF token if session design requires it;
- do not enable permissive CORS;
- do not return `Access-Control-Allow-Origin: *`;
- keep authentication cookies `Secure`, `HttpOnly`, and appropriately `SameSite`.

### 7.6 Authorization tests

Add automated tests covering every route and method:

- missing assertion;
- malformed assertion;
- expired assertion;
- valid assertion for the wrong email;
- valid assertion with the wrong audience;
- valid owner assertion;
- missing, wrong, expired, and valid agent publishing tokens;
- agent credentials presented to owner-only routes;
- unsupported HTTP methods;
- cross-origin mutation attempts.

The default test expectation for a new API route should be denial. A new route cannot ship without an explicit access classification and authorization test.

## 8. Phase 3 — Prevent origin bypass

The preferred public path is Cloudflare Tunnel, not a publicly exposed Coolify/Traefik port.

### 8.1 Network requirements

- Publish `brief.haegens.be` through a Cloudflare Tunnel.
- Enable **Protect with Access** or equivalent Access-token validation on the tunnel route.
- Do not expose container port 3000 on the public host interface.
- Attach the application only to the internal proxy/tunnel network.
- If Compose port publication is required for a local proxy, bind it to loopback, for example `127.0.0.1:3000:3000`, not `0.0.0.0`.
- Block the application port at the host and upstream firewall.
- Ensure the origin IP cannot serve the application when addressed directly with a forged `Host` header.
- Restrict Coolify, SSH, hypervisor, storage, DNS, registrar, and Cloudflare administration to owner accounts with MFA.

Cloudflare documentation recommends validating the Access application token at the origin so requests that bypass the edge are rejected:

<https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/>

### 8.2 Direct-origin validation

Test from outside the host network:

- direct requests to the origin IP on ports 80, 443, and 3000 must time out or be rejected;
- sending `Host: brief.haegens.be` directly to the origin must not return the app;
- historical DNS or certificate records revealing an old origin must not make the app reachable;
- only the configured Cloudflare Tunnel/internal proxy path may connect to the container.

## 9. Phase 4 — Container and host hardening

Update the production container and runtime configuration:

- create and use an unprivileged application user;
- make the root filesystem read-only where compatible;
- mount only `/data` read/write;
- mount a small `tmpfs` for required temporary files;
- drop all Linux capabilities unless a specific one is documented as necessary;
- enable `no-new-privileges`;
- set resource limits for CPU, memory, processes, and writable storage;
- do not mount the Docker socket, SSH keys, home directories, or unrelated host paths;
- use a pinned, maintained Node base-image digest and rebuild it regularly;
- scan the final container image for OS and package vulnerabilities;
- keep Coolify, Docker, the host OS, Cloudflare Tunnel, and the reverse proxy patched.

The application health check should operate on the private container network. It does not require a public Cloudflare bypass.

Acceptance criteria:

- the process UID is non-root;
- the process can write only to the documented data and temporary locations;
- the container cannot reach the Docker API or unrelated host files;
- resource exhaustion of the application does not exhaust the host.

## 10. Phase 5 — Confidential response handling

### 10.1 Caching and indexing

Apply these headers to the UI and all private APIs:

```text
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
Expires: 0
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
```

Do not cache briefing data at Cloudflare, in Next.js, in a service worker, or in browser storage. Remove the current long-lived `s-maxage` behavior from the owner page.

Add a restrictive `robots.txt` as an extra signal, while recognizing that robots controls are not authentication.

### 10.2 Security headers

Set and test at least:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

Add a Content Security Policy based on actual application requirements:

- `default-src 'self'`
- `object-src 'none'`
- `base-uri 'none'`
- `frame-ancestors 'none'`
- `form-action 'self'`
- `connect-src 'self'`
- local fonts and images only, except explicitly reviewed requirements
- use nonces or hashes for scripts where feasible
- do not add broad wildcards merely to silence CSP errors

Disable the `X-Powered-By` header. Keep all application assets local. The existing external glossary links should retain `rel="noreferrer"`, and the global no-referrer policy prevents a briefing URL or slug being sent to the destination.

### 10.3 TLS

- redirect HTTP to HTTPS at the outermost layer;
- permit modern TLS versions and ciphers only;
- monitor certificate renewal;
- consider HSTS preload only after confirming every required subdomain is permanently HTTPS-capable.

## 11. Phase 6 — Input, abuse, and availability controls

Treat every agent payload as untrusted, even when the agent is approved.

### 11.1 Request limits

Enforce limits at Cloudflare/reverse proxy and again in the application:

- maximum request body, initially 512 KiB unless a real use case requires more;
- reject an absent, invalid, or excessive `Content-Length` before parsing where possible;
- maximum number of cards per briefing, for example 100;
- maximum total text size per briefing;
- maximum length for every title, summary, body item, metadata, action label, reference, source name, and visualization field;
- maximum array sizes at every nesting level;
- maximum JSON nesting depth if supported by the parser/validator;
- reject unknown content types and invalid encodings.

The reverse proxy limit is necessary because `req.json()` otherwise loads the payload into application memory before validation.

### 11.2 Rate limits

Apply rate limits by endpoint and credential:

- low sustained and burst limits for `/api/ingest` per service token and publishing token;
- owner-appropriate limits for private read and mutation routes;
- strict limits for repeated invalid slugs, invalid card IDs, and failed credentials;
- temporary lockout or backoff for repeated failures without creating an easy denial-of-service against the owner.

Return generic errors. Do not reveal whether a particular slug, card, owner email, or token exists to unauthorized callers.

### 11.3 Rendering and references

- continue rendering briefing strings as escaped React text;
- never add arbitrary HTML rendering or `dangerouslySetInnerHTML` for agent content;
- sanitize any future Markdown with a strict allowlist;
- validate future URLs and allow only expected `https:` destinations;
- do not expose filesystem paths to the client;
- validate MIME type and content independently for future attachments.

## 12. Phase 7 — Storage, retention, and deletion

### 12.1 Minimize duplicate plaintext

The current design writes complete content to both an immutable JSON file and SQLite. Choose one authoritative encrypted representation where possible. Every duplicate expands the confidentiality and deletion surface.

For file-drop ingestion:

- delete the source file immediately after successful ingestion instead of retaining it in `/data/processed`; or retain only a non-sensitive receipt containing a timestamp and opaque identifier;
- do not indefinitely retain failed raw payloads in `/data/failed`;
- if failed payloads are required for diagnosis, encrypt and access-restrict the directory and automatically delete files after a short period, initially no more than 24 hours;
- use opaque generated filenames and never log a confidential original filename.

### 12.2 Define the tombstone

After completion, retain only fields that have a documented operational need. Review and normally remove:

- briefing title;
- source name where it identifies a customer or project;
- card title, summary, body, content, metadata, reference, and free-form action choice;
- stored JSON path;
- any other content-derived label.

A minimal tombstone should normally contain an opaque internal identifier, completion timestamp, content-deleted flag, and only the minimum non-sensitive counters required by the product.

Do not claim “permanent purge” until all live files, database remnants, replicas, snapshots, logs, and backups are covered by a verified deletion design. Until then, describe the operation as deletion from the active application.

### 12.3 SQLite deletion behavior

Implement and test:

- `PRAGMA secure_delete = ON` before confidential records are created;
- a transaction that deletes or overwrites all sensitive fields consistently;
- an appropriate WAL checkpoint/truncation after purge;
- vacuum or incremental-vacuum behavior appropriate to the availability requirements;
- controlled database shutdown and backup procedures;
- tests proving that a unique synthetic marker cannot be recovered from the active DB, WAL, SHM, JSON, processed, failed, or temporary files after purge.

SQLite secure deletion improves logical media sanitization but cannot guarantee removal from SSD remapping, filesystem snapshots, host backups, or copied files. Those require encryption and retention controls.

### 12.4 Encryption at rest

At minimum:

- use an encrypted host/storage volume;
- encrypt every backup before it leaves the host;
- keep encryption keys outside the data volume;
- limit key access to the application and owner;
- document key rotation, recovery, and loss procedures.

For stronger per-briefing deletion, use application-level authenticated encryption with a separate data-encryption key per briefing and delete the wrapped key on completion. This enables cryptographic erasure of historical ciphertext, provided keys were not copied elsewhere.

### 12.5 Backups and retention

Define in writing:

- what is backed up;
- encryption method and key owner;
- backup destination and administrators;
- backup frequency;
- maximum retention, initially as short as operationally acceptable;
- deletion propagation timeline after a briefing is completed;
- restore testing schedule;
- secure destruction method when a backup expires.

Restores must not silently reintroduce a briefing that was already deleted. Maintain a protected deletion ledger or equivalent process to reapply deletions after restore without retaining the deleted content itself.

## 13. Phase 8 — Secrets and publisher identity

Replace the single shared publisher key with per-agent credentials:

- generate at least 256 bits of randomness;
- store only a keyed hash of application publishing tokens where possible;
- identify tokens by a non-secret prefix or ID;
- support expiry, rotation, immediate revocation, and last-used timestamps;
- scope every publisher to ingestion only;
- never allow a publisher token to read briefings;
- log the publisher ID, status, and request ID, but never the secret or briefing content.

Store deployment secrets only in the Coolify secret manager or an appropriate external secret manager. Confirm that secrets are not exposed through build arguments, Docker image layers, client bundles, diagnostics, or repository history.

The GitHub repository is currently public. Public source code is not itself an authentication weakness, but no real briefing, customer material, `.env`, database, log, export, screenshot, or secret may be committed. Review untracked examples before every push and use synthetic fixtures for tests and demos.

## 14. Phase 9 — Logging, monitoring, and incident response

### 14.1 Logging rules

Allowed operational log fields include:

- request ID;
- timestamp;
- endpoint template, not a sensitive full URL;
- response status;
- duration;
- authenticated owner/publisher ID in minimized or hashed form;
- coarse rate-limit and authentication result.

Do not log:

- briefing title, summary, body, content, metadata, or references;
- source/customer names unless indispensable;
- bearer or service tokens;
- Access JWTs, cookies, authorization headers, or CSRF values;
- raw request or response bodies;
- secret-bearing URLs or query strings;
- sensitive filenames.

Protect logs with access control, encryption, and a short retention period. Ensure proxy, Cloudflare, Coolify, container, database, and backup logs follow the same rules.

### 14.2 Monitoring

Alert on:

- repeated authentication or token failures;
- access attempts by a non-owner identity;
- unusual ingestion volume or payload size;
- requests to private APIs without a validated owner;
- direct-origin connection attempts;
- dependency or container critical vulnerabilities;
- unexpected container restarts or disk growth;
- failure of deletion, backup encryption, or backup expiry;
- Access policy changes and newly created administrator accounts.

### 14.3 Existing-exposure review

Because the site was publicly accessible:

1. record the earliest date confidential data was uploaded;
2. preserve and restrict relevant logs before ordinary retention removes them;
3. inspect Cloudflare HTTP/security logs, reverse-proxy access logs, Coolify logs, and application logs for requests to `/api/briefings`, `/api/briefings/*`, `/api/sources`, `/api/cards/*`, and completion routes;
4. distinguish owner IPs and expected health checks from unexplained access;
5. note that a Cloudflare `Bypass` policy does not provide normal Access authentication logging;
6. rotate publishing credentials regardless of whether suspicious access is found;
7. document the result and decide whether affected data owners or organizations need notification under applicable policy, contract, or law.

Absence of logs is not proof that access did not occur.

### 14.4 Incident procedure

If suspicious access or host compromise is suspected:

1. stop ingestion and remove public availability;
2. preserve evidence without copying confidential content unnecessarily;
3. revoke Access sessions, service tokens, publishing tokens, and administrative sessions;
4. rotate Cloudflare, Coolify, host, backup, and encryption credentials as applicable;
5. rebuild from a known-good patched image rather than trusting the running container;
6. review database, data volume, host, and backup integrity;
7. document scope, timeline, data affected, containment, and recovery;
8. obtain specialist incident-response or legal help where sensitivity or obligations justify it.

## 15. Operational security

- Use unique passwords and MFA for Cloudflare, the identity provider, registrar, DNS, Coolify, GitHub, host, hypervisor, and backup provider.
- Keep the owner identity’s recovery methods current and protected.
- Remove unused administrators, API tokens, SSH keys, and service credentials.
- Review Cloudflare Access applications and policies monthly.
- Review publisher credentials at least quarterly and on every agent retirement.
- Patch critical vulnerabilities immediately and other security updates on a defined schedule.
- Restore-test backups without using production confidential content.
- Use synthetic data in development, demos, screenshots, and automated tests.
- Do not expose the app over a home LAN, VPN, alternate hostname, raw IP, or temporary tunnel without equivalent controls.

## 16. Implementation order

Execute in this order:

1. **Contain:** enable owner-only Cloudflare Access and remove all broad bypasses.
2. **Verify:** prove logged-out users receive no UI or private API data.
3. **Rotate:** replace the existing publishing bearer token.
4. **Patch:** upgrade Next.js/React and rebuild the production image.
5. **Authorize in-app:** validate the owner at the server-rendered page and every private route.
6. **Isolate origin:** deploy Tunnel/Access validation and close public host ports.
7. **Add headers, no-store, CSRF, request limits, and rate limits.**
8. **Fix retention and purge:** remove duplicate files, sanitize tombstones, handle WAL and backups, and encrypt storage.
9. **Harden the container and administrative accounts.**
10. **Complete the historical access review and document the outcome.**

Phases 0 and 1 are prerequisites for uploading more confidential data. Application authorization and origin isolation should follow immediately; they are necessary to call the design defense-in-depth rather than merely edge-protected.

## 17. Final definition of done

Briefing Hub is approved for its intended confidential use only when all of the following are true:

- [ ] Logged-out outsiders cannot retrieve the UI HTML or use any UI route.
- [ ] Logged-out outsiders cannot list, read, mutate, complete, or delete any briefing.
- [ ] A valid identity other than the exact owner is denied.
- [ ] The owner can authenticate with MFA and use every intended UI operation.
- [ ] Agents can access only `POST /api/ingest` and need both Cloudflare service authentication and an application publishing token.
- [ ] Every private application handler performs server-side owner authorization.
- [ ] The origin is not publicly reachable and validates Cloudflare Access assertions.
- [ ] No high or critical production dependency advisory remains.
- [ ] Confidential responses are `private, no-store`, non-indexable, and protected by the documented security headers.
- [ ] Cross-origin mutations and permissive CORS are rejected.
- [ ] Payload size, schema size, and request rate limits are enforced.
- [ ] The container runs non-root with minimal filesystem, network, and host privileges.
- [ ] The active data volume and all backups are encrypted with controlled keys.
- [ ] Processed and failed raw payload retention is eliminated or strictly time-limited.
- [ ] Purge tests demonstrate removal of synthetic content from active files, SQLite, WAL, and temporary storage.
- [ ] Backup expiry and restore-time deletion propagation are documented and tested.
- [ ] Logs contain no briefing content or secrets and have a defined retention period.
- [ ] Administrative accounts and credentials are inventoried, owner-controlled, MFA-protected, and reviewed.
- [ ] The prior public-exposure review is documented.
- [ ] An unauthenticated external regression test is run after every access, proxy, authentication, or deployment change.

## 18. Deployment record

Complete this table as work is performed:

| Control | Owner | Date completed | Evidence/test result | Next review |
|---|---|---|---|---|
| Cloudflare owner application |  |  |  |  |
| Ingestion Service Auth application |  |  |  |  |
| Broad bypass removed |  |  |  |  |
| Publishing token rotated |  |  |  |  |
| Next.js/React patched |  |  |  |  |
| Application owner authorization |  |  |  |  |
| Origin isolated |  |  |  |  |
| Container hardened |  |  |  |  |
| Security headers and no-store |  |  |  |  |
| Limits and rate controls |  |  |  |  |
| Storage encryption |  |  |  |  |
| Retention and purge verified |  |  |  |  |
| Backup controls verified |  |  |  |  |
| Historical exposure reviewed |  |  |  |  |

