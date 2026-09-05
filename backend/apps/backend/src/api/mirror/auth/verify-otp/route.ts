import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MIRROR_MODULE } from "../../../../modules/mirror"
import type { MirrorModuleService } from "../../../../modules/mirror/service"
import {
  createSessionToken,
  normalizePhone,
  verifyOtp,
} from "../../../../lib/mirror-security"

type RequestBody = {
  phone?: string
  otp?: string
  name?: string
  email?: string
}

export async function POST(req: MedusaRequest<RequestBody>, res: MedusaResponse) {
  const phone = normalizePhone(req.body?.phone)
  const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : ""
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : ""

  if (!phone || !otp) {
    return res.status(400).json({ error: "Phone and OTP are required" })
  }
  if (name.length > 150) {
    return res.status(400).json({ error: "Name must be 150 characters or fewer" })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address or leave it blank" })
  }

  const service = req.scope.resolve(MIRROR_MODULE) as MirrorModuleService
  const otpRequests = await service.listMirrorOtpRequests(
    { phone },
    { order: { created_at: "DESC" }, take: 1 },
  )
  const otpRequest = otpRequests[0]

  if (
    !otpRequest ||
    new Date(otpRequest.expires_at).getTime() <= Date.now() ||
    !verifyOtp(otp, otpRequest.otp_hash)
  ) {
    return res.status(400).json({ error: "Invalid or expired OTP" })
  }

  const users = await service.listMirrorUsers({ phone }, { take: 1 })
  let user = users[0]

  if (!user && !name) {
    return res.json({
      success: true,
      profileRequired: true,
      message: "OTP verified. Complete your profile to continue.",
    })
  }

  if (!user) {
    user = await service.createMirrorUsers({
      phone,
      name,
      email: email || null,
      role: "citizen",
      phone_verified: true,
    })
  } else if (!user.name?.trim() || user.name.trim().toLowerCase() === "citizen") {
    if (!name) {
      return res.json({ success: true, profileRequired: true })
    }
    user = await service.updateMirrorUsers({
      id: user.id,
      name,
      email: email || null,
      phone_verified: true,
    })
  }

  const { token, tokenHash } = createSessionToken()
  await service.createMirrorSessions({
    token_hash: tokenHash,
    user_id: user.id,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revoked_at: null,
  })
  await service.deleteMirrorOtpRequests(otpRequest.id)

  return res.json({
    success: true,
    message: "Login successful",
    token,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
    },
  })
}
