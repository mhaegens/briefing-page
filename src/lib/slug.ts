import { randomBytes } from "crypto";

export function generateSlug(): string {
  return randomBytes(9).toString("base64url");
}
