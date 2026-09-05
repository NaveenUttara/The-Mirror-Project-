import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import type { MirrorModuleService } from "../modules/mirror/service"

export function hashOtp(otp: string): string {
  const salt = randomBytes(16).toString("hex")
  return `${scryptSync(otp, salt, 64).toString("hex")}:${salt}`
}

export function verifyOtp(otp: string, storedValue: string): boolean {
  const [storedHash, salt] = storedValue.split(":")

  if (!storedHash || !salt) {
    return false
  }

  const submitted = scryptSync(otp, salt, 64)
  const stored = Buffer.from(storedHash, "hex")
  return stored.length === submitted.length && timingSafeEqual(stored, submitted)
}

export function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(48).toString("base64url")
  return { token, tokenHash: hashSessionToken(token) }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^0-9+]/g, "").trim() : ""
}

export async function authenticateMirrorRequest(
  req: MedusaRequest,
  service: MirrorModuleService,
) {
  const authorization = req.headers.authorization
  if (!authorization?.startsWith("Bearer ")) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "AUTH_REQUIRED")
  }

  const token = authorization.slice(7).trim()
  const sessions = await service.listMirrorSessions(
    { token_hash: hashSessionToken(token) },
    { take: 1 },
  )
  const session = sessions[0]

  if (
    !session ||
    session.revoked_at ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "AUTH_REQUIRED")
  }

  return service.retrieveMirrorUser(session.user_id)
}
