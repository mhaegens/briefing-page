import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = await headers();
  const jwt = h.get("Cf-Access-Jwt-Assertion");
  if (!jwt) {
    return NextResponse.json({ error: "No CF JWT header present" });
  }
  try {
    const [, payload] = jwt.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return NextResponse.json({ email: decoded.email, aud: decoded.aud, sub: decoded.sub });
  } catch {
    return NextResponse.json({ error: "Could not decode JWT", raw_present: true });
  }
}
