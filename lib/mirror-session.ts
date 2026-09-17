import { createHash, randomBytes } from "crypto";

export function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^0-9+]/g, "").trim() : "";
}

export function mirrorEntityId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}
