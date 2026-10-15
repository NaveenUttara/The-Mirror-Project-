import { timingSafeEqual } from "node:crypto"
import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

function safeEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function assertMirrorEmailAdmin(req: MedusaRequest): void {
  const secret = process.env.REPORT_EMAIL_RESEND_SECRET?.trim()
  if (!secret) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Set REPORT_EMAIL_RESEND_SECRET on the server to use report email admin APIs",
    )
  }

  const header = req.headers["x-mirror-email-secret"]
  const provided = typeof header === "string" ? header.trim() : ""
  if (!provided || secret.length !== provided.length || !safeEqual(secret, provided)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Invalid email admin secret")
  }
}
