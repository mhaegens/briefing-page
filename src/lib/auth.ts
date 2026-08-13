import { createRemoteJWKSet, jwtVerify } from "jose";

export async function requireOwner(request: Request): Promise<void> {
  const teamDomain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
  const audience = process.env.CLOUDFLARE_ACCESS_AUDIENCE;
  const ownerEmail = process.env.BRIEFING_HUB_OWNER_EMAIL;

  const isProduction = process.env.NODE_ENV === "production";
  const skipAuth = process.env.DEV_SKIP_AUTH === "true";

  if (!isProduction && skipAuth) {
    return;
  }

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
    const JWKS = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`)
    );

    const { payload } = await jwtVerify(token, JWKS, {
      audience,
    });

    if (payload.email !== ownerEmail) {
      throw new Error("Email mismatch");
    }
  } catch {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}
