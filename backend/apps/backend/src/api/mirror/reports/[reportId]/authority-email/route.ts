import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MIRROR_MODULE } from "../../../../../modules/mirror"
import type { MirrorModuleService } from "../../../../../modules/mirror/service"
import { sendAuthorityReportEmail } from "../../../../../lib/authority-report-email"
import { listIntendedAuthorityRecipients, parseExtraRecipientList } from "../../../../../lib/bbmp-zone-mail"
import { assertMirrorEmailAdmin } from "../../../../../lib/mirror-email-admin"
import { loadAuthorityReportEmailPayload } from "../../../../../lib/mirror-report-email-loader"

function adminErrorResponse(res: MedusaResponse, error: unknown) {
  if (error instanceof Error) {
    if (error.message === "REPORT_NOT_FOUND") {
      return res.status(404).json({ error: "Report not found" })
    }
    if (error.message.includes("email admin")) {
      return res.status(403).json({ error: error.message })
    }
    if (error.message.includes("REPORT_EMAIL_RESEND_SECRET")) {
      return res.status(503).json({ error: error.message })
    }
  }

  const message = error instanceof Error ? error.message : "Internal Server Error"
  return res.status(500).json({ error: message })
}

/** Lists who should receive BBMP mail for this report (from GPS). Does not show Resend history. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    assertMirrorEmailAdmin(req)
    const service = req.scope.resolve(MIRROR_MODULE) as MirrorModuleService
    const publicReportId = req.params.reportId
    const payload = await loadAuthorityReportEmailPayload(service, publicReportId)
    const { recipients, zone } = listIntendedAuthorityRecipients(
      payload.latitude,
      payload.longitude,
      parseExtraRecipientList(),
    )

    return res.json({
      reportId: payload.reportId,
      zone: zone
        ? { zoneId: zone.zoneId, zoneName: zone.zoneName, zonalEmail: zone.zonalEmail }
        : null,
      intendedRecipients: recipients,
      howToSeeFailures:
        "In Railway logs, search this reportId for authority_email_recipient_failed or failedRecipients inside authority_email_sent.",
      howToResendMissing:
        "POST this URL with JSON { \"recipients\": [\"failed@address\"] } or omit recipients to resend to everyone intended.",
    })
  } catch (error) {
    return adminErrorResponse(res, error)
  }
}

/** Resend BBMP notification. Body: { recipients?: string[] } — omit to resend all intended inboxes. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    assertMirrorEmailAdmin(req)
    const service = req.scope.resolve(MIRROR_MODULE) as MirrorModuleService
    const publicReportId = req.params.reportId
    const body = (req.body ?? {}) as { recipients?: unknown }
    const onlyRecipients = Array.isArray(body.recipients)
      ? body.recipients.filter((entry): entry is string => typeof entry === "string")
      : undefined

    const payload = await loadAuthorityReportEmailPayload(service, publicReportId)
    const summary = await sendAuthorityReportEmail(payload, { onlyRecipients })

    if (!summary) {
      return res.status(503).json({ error: "Authority email is not configured on this server" })
    }

    return res.json({
      reportId: payload.reportId,
      intendedRecipients: summary.intendedRecipients,
      sent: summary.sent,
      failed: summary.failed,
      acceptedCount: summary.acceptedCount,
    })
  } catch (error) {
    if (error instanceof Error && error.message === "no_matching_recipients") {
      return res.status(400).json({
        error: "None of the requested recipients are on the intended list for this report GPS",
      })
    }
    return adminErrorResponse(res, error)
  }
}
