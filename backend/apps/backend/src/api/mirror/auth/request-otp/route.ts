import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MIRROR_MODULE } from "../../../../modules/mirror"
import type { MirrorModuleService } from "../../../../modules/mirror/service"
import { hashOtp, normalizePhone } from "../../../../lib/mirror-security"

type RequestBody = { phone?: string }

export async function POST(req: MedusaRequest<RequestBody>, res: MedusaResponse) {
  const phone = normalizePhone(req.body?.phone)

  if (phone.replace(/\D/g, "").length < 10) {
    return res.status(400).json({ error: "Valid mobile number is required" })
  }

  const service = req.scope.resolve(MIRROR_MODULE) as MirrorModuleService
  const smsApiKey = process.env.SMS_API_KEY?.trim()
  const temporaryOtp = !smsApiKey
  const otp = temporaryOtp
    ? "123456"
    : String(Math.floor(100000 + Math.random() * 900000))

  await service.createMirrorOtpRequests({
    phone,
    otp_hash: hashOtp(otp),
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
  })

  // SMS delivery will be enabled only after the approved provider is configured.
  return res.json({
    success: true,
    message: temporaryOtp ? "Temporary OTP generated" : "OTP generated",
    debugOtp: temporaryOtp ? otp : undefined,
  })
}
