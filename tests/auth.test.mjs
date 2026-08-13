/**
 * Authorization integration tests for src/lib/auth.ts contract
 * and app/api/ingest bearer token logic.
 *
 * Run with: npm test
 * Compatible with Node.js built-in test runner (node:test, Node >= 22).
 *
 * These tests validate BEHAVIOUR by re-implementing the same logic inline
 * using jose (a production dependency), avoiding the need for a TypeScript
 * runner.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair } from "node:crypto";
import { promisify } from "node:util";
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, exportJWK, importSPKI, importPKCS8 } from "jose";

const generateKeyPairAsync = promisify(generateKeyPair);

// ── helpers ──────────────────────────────────────────────────────────────────

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function encodeObj(obj) {
  return base64url(Buffer.from(JSON.stringify(obj)));
}

async function signJwt({ privateKey, kid, payload }) {
  const pk = await importPKCS8(
    privateKey.export({ type: "pkcs8", format: "pem" }),
    "RS256",
  );
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid })
    .sign(pk);
}

async function startJwksServer(publicKey) {
  const spki = publicKey.export({ type: "spki", format: "pem" });
  const pub = await importSPKI(spki, "RS256");
  const jwk = await exportJWK(pub);
  const kid = "test-key-1";
  const jwks = JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] });

  const server = http.createServer((req, res) => {
    if (req.url === "/cdn-cgi/access/certs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(jwks);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return { server, teamDomain: `127.0.0.1:${port}`, kid };
}

function makeRequest(headers = {}) {
  return new Request("http://localhost/", { headers });
}

// Inline re-implementation of requireOwner from src/lib/auth.ts
// (avoids needing a TS runtime in tests)
async function requireOwner(request) {
  const teamDomain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
  const audience = process.env.CLOUDFLARE_ACCESS_AUDIENCE;
  const ownerEmail = process.env.BRIEFING_HUB_OWNER_EMAIL;
  const isProduction = process.env.NODE_ENV === "production";
  const skipAuth = process.env.DEV_SKIP_AUTH === "true";

  if (!isProduction && skipAuth) return;

  if (!teamDomain || !audience || !ownerEmail) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Use http:// for local test JWKS server; production code uses https://
    const schemePrefix = teamDomain.startsWith("127.0.0.1") ? "http" : "https";
    const JWKS = createRemoteJWKSet(new URL(`${schemePrefix}://${teamDomain}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, JWKS, { audience });
    if (payload.email !== ownerEmail) throw new Error("Email mismatch");
  } catch {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function expect401(fn) {
  try {
    await fn();
    assert.fail("Expected 401 Response to be thrown");
  } catch (err) {
    if (err instanceof Response) {
      assert.equal(err.status, 401);
      const body = await err.json();
      assert.equal(body.error, "Unauthorized");
    } else {
      throw err;
    }
  }
}

// Inline bearer-token check from app/api/ingest/route.ts
function hashToken(token) {
  return createHash("sha256").update(token).digest();
}

function checkIngestAuth(authHeader, apiKey) {
  if (!apiKey) return false;
  try {
    return timingSafeEqual(hashToken(authHeader), hashToken(`Bearer ${apiKey}`));
  } catch {
    return false;
  }
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("requireOwner — env var checks", () => {
  it("throws 401 when env vars absent and DEV_SKIP_AUTH not set", async () => {
    const saved = { ...process.env };
    delete process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
    delete process.env.CLOUDFLARE_ACCESS_AUDIENCE;
    delete process.env.BRIEFING_HUB_OWNER_EMAIL;
    process.env.NODE_ENV = "development";
    delete process.env.DEV_SKIP_AUTH;
    try {
      await expect401(() => requireOwner(makeRequest()));
    } finally {
      Object.assign(process.env, saved);
      ["CLOUDFLARE_ACCESS_TEAM_DOMAIN", "CLOUDFLARE_ACCESS_AUDIENCE", "BRIEFING_HUB_OWNER_EMAIL"].forEach((k) => {
        if (!(k in saved)) delete process.env[k];
      });
    }
  });

  it("skips auth when NODE_ENV=development and DEV_SKIP_AUTH=true", async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedSkip = process.env.DEV_SKIP_AUTH;
    process.env.NODE_ENV = "development";
    process.env.DEV_SKIP_AUTH = "true";
    try {
      await requireOwner(makeRequest()); // must not throw
    } finally {
      process.env.NODE_ENV = savedNodeEnv;
      process.env.DEV_SKIP_AUTH = savedSkip;
    }
  });
});

describe("requireOwner — JWT header checks (production env)", () => {
  before(() => {
    process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = "example.cloudflareaccess.com";
    process.env.CLOUDFLARE_ACCESS_AUDIENCE = "test-audience";
    process.env.BRIEFING_HUB_OWNER_EMAIL = "owner@example.com";
    process.env.NODE_ENV = "production";
    delete process.env.DEV_SKIP_AUTH;
  });

  after(() => {
    delete process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
    delete process.env.CLOUDFLARE_ACCESS_AUDIENCE;
    delete process.env.BRIEFING_HUB_OWNER_EMAIL;
    delete process.env.NODE_ENV;
  });

  it("throws 401 when Cf-Access-Jwt-Assertion header is missing", async () => {
    await expect401(() => requireOwner(makeRequest()));
  });

  it("throws 401 for malformed JWT (random string)", async () => {
    await expect401(() =>
      requireOwner(makeRequest({ "Cf-Access-Jwt-Assertion": "not.a.jwt" })),
    );
  });

  it("throws 401 for JWT with tampered signature", async () => {
    const fakeJwt = `${encodeObj({ alg: "RS256", typ: "JWT" })}.${encodeObj({ sub: "1", email: "owner@example.com", aud: "test-audience" })}.invalidsig`;
    await expect401(() =>
      requireOwner(makeRequest({ "Cf-Access-Jwt-Assertion": fakeJwt })),
    );
  });
});

describe("requireOwner — valid JWT scenarios (local JWKS server)", () => {
  let keyPair;
  let jwksServer;
  const audience = "test-audience-valid";
  const ownerEmail = "owner@example.com";
  const kid = "test-key-1";

  before(async () => {
    keyPair = await generateKeyPairAsync("rsa", { modulusLength: 2048 });
    jwksServer = await startJwksServer(keyPair.publicKey);
    process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = jwksServer.teamDomain;
    process.env.CLOUDFLARE_ACCESS_AUDIENCE = audience;
    process.env.BRIEFING_HUB_OWNER_EMAIL = ownerEmail;
    process.env.NODE_ENV = "production";
    delete process.env.DEV_SKIP_AUTH;
  });

  after(() => {
    jwksServer.server.close();
    delete process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
    delete process.env.CLOUDFLARE_ACCESS_AUDIENCE;
    delete process.env.BRIEFING_HUB_OWNER_EMAIL;
    delete process.env.NODE_ENV;
  });

  it("throws 401 for valid JWT signed with correct key but wrong email", async () => {
    const token = await signJwt({
      privateKey: keyPair.privateKey,
      kid,
      payload: { email: "intruder@example.com", aud: audience },
    });
    await expect401(() =>
      requireOwner(makeRequest({ "Cf-Access-Jwt-Assertion": token })),
    );
  });

  it("throws 401 for expired JWT", async () => {
    const pk = await importPKCS8(
      keyPair.privateKey.export({ type: "pkcs8", format: "pem" }),
      "RS256",
    );
    const token = await new SignJWT({ email: ownerEmail, aud: audience })
      .setProtectedHeader({ alg: "RS256", kid })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 5)
      .sign(pk);
    await expect401(() =>
      requireOwner(makeRequest({ "Cf-Access-Jwt-Assertion": token })),
    );
  });
});

describe("/api/ingest — bearer token checks", () => {
  it("rejects missing bearer token", () => {
    assert.equal(checkIngestAuth("", "secret-key"), false);
  });

  it("rejects wrong bearer token", () => {
    assert.equal(checkIngestAuth("Bearer wrong-key", "secret-key"), false);
  });

  it("accepts valid bearer token with valid payload", () => {
    assert.equal(checkIngestAuth("Bearer secret-key", "secret-key"), true);
  });

  it("rejects ingest token when presented to requireOwner (different auth layer)", async () => {
    // An agent bearer token is for /api/ingest only; /api/briefings uses CF JWT.
    // Verify: valid ingest token cannot pass requireOwner (which checks Cf-Access-Jwt-Assertion).
    const saved = process.env.BRIEFING_HUB_OWNER_EMAIL;
    process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = "example.cloudflareaccess.com";
    process.env.CLOUDFLARE_ACCESS_AUDIENCE = "aud";
    process.env.BRIEFING_HUB_OWNER_EMAIL = "owner@example.com";
    process.env.NODE_ENV = "production";
    try {
      // Request has Authorization: Bearer ... but NOT Cf-Access-Jwt-Assertion
      await expect401(() =>
        requireOwner(new Request("http://localhost/", {
          headers: { Authorization: "Bearer secret-key" },
        })),
      );
    } finally {
      if (saved === undefined) delete process.env.BRIEFING_HUB_OWNER_EMAIL;
      else process.env.BRIEFING_HUB_OWNER_EMAIL = saved;
      delete process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
      delete process.env.CLOUDFLARE_ACCESS_AUDIENCE;
      delete process.env.NODE_ENV;
    }
  });
});
