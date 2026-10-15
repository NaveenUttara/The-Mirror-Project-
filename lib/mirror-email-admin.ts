import { timingSafeEqual } from "node:crypto";

function safeEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assertMirrorEmailAdminRequest(request: Request): void {
  const secret = process.env.REPORT_EMAIL_RESEND_SECRET?.trim();
  if (!secret) {
    throw new Error("REPORT_EMAIL_RESEND_SECRET is not configured on this server");
  }

  const provided = request.headers.get("x-mirror-email-secret")?.trim() ?? "";
  if (!provided || secret.length !== provided.length || !safeEqual(secret, provided)) {
    throw new Error("Invalid email admin secret");
  }
}
