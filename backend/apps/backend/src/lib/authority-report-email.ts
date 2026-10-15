import {
  isInsideBengaluruServiceArea,
  parseExtraRecipientList,
  resolveBbmpMailTargets,
  type BbmpZoneMatch,
} from "./bbmp-zone-mail"

export type AuthorityReportEmailPayload = {
  requestId: string
  reportId: string
  potholeId: string
  latitude: number
  longitude: number
  severity: string
  description: string | null
  citizenName: string
  citizenPhone: string
  citizenEmail: string | null
  photo?: {
    filename: string
    mimeType: string
    buffer: Buffer
  }
}

function mapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}

function buildHtml(payload: AuthorityReportEmailPayload, zone: BbmpZoneMatch | null): string {
  const description = payload.description?.trim() || "(No description provided)"
  const zoneLine = zone
    ? `<p><strong>BBMP zone:</strong> ${zone.zoneName} (${zone.zonalEmail})</p>`
    : isInsideBengaluruServiceArea(payload.latitude, payload.longitude)
      ? "<p><strong>BBMP zone:</strong> Could not be auto-matched — central BBMP only.</p>"
      : "<p><strong>BBMP zone:</strong> Outside configured Bengaluru zones — central BBMP only.</p>"

  return `
    <h2>New pothole complaint — The Mirror Project → BBMP</h2>
    <p><strong>Report ID:</strong> ${payload.reportId}</p>
    <p><strong>Pothole ID:</strong> ${payload.potholeId}</p>
    <p><strong>Severity:</strong> ${payload.severity}</p>
    ${zoneLine}
    <p><strong>Location:</strong> ${payload.latitude}, ${payload.longitude}</p>
    <p><a href="${mapsLink(payload.latitude, payload.longitude)}">Open in Google Maps</a></p>
    <p><strong>Description:</strong></p>
    <p>${description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    <hr />
    <p><strong>Citizen:</strong> ${payload.citizenName}</p>
    <p><strong>Phone:</strong> ${payload.citizenPhone}</p>
    <p><strong>Email:</strong> ${payload.citizenEmail || "(not provided)"}</p>
  `.trim()
}

function authorityEmailSkipReason(): string | null {
  if (process.env.BBMP_EMAIL_ENABLED === "false") {
    return "disabled"
  }

  const missing = ["RESEND_API_KEY", "REPORT_EMAIL_FROM"]
    .filter((name) => !process.env[name]?.trim())
  return missing.length ? `missing_${missing.join("_")}` : null
}

export function isAuthorityEmailConfigured(): boolean {
  return authorityEmailSkipReason() === null
}

export async function sendAuthorityReportEmail(
  payload: AuthorityReportEmailPayload,
): Promise<{ messageId?: string; acceptedCount: number } | undefined> {
  if (!isAuthorityEmailConfigured()) {
    return
  }

  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.REPORT_EMAIL_FROM?.trim()
  if (!apiKey || !from) return

  const { to, cc, zone } = resolveBbmpMailTargets(
    payload.latitude,
    payload.longitude,
    parseExtraRecipientList(),
  )

  const zoneLabel = zone ? zone.zoneName : "Central BBMP"
  const attachments = payload.photo
    ? [{
      filename: payload.photo.filename,
      content: payload.photo.buffer.toString("base64"),
    }]
    : undefined

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: "themirrorproject93@gmail.com",
      to,
      cc: cc.length ? cc : undefined,
      subject: `[Mirror → BBMP] ${zoneLabel} — ${payload.reportId} (${payload.severity})`,
      html: buildHtml(payload, zone),
      attachments,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Resend API ${response.status}: ${detail.slice(0, 500)}`)
  }

  const result = await response.json().catch(() => null) as { id?: string } | null
  return { messageId: result?.id, acceptedCount: to.length + cc.length }
}

export function queueAuthorityReportEmail(payload: AuthorityReportEmailPayload): void {
  const skipReason = authorityEmailSkipReason()
  if (skipReason) {
    console.warn(JSON.stringify({
      event: "authority_email_skipped",
      requestId: payload.requestId,
      reportId: payload.reportId,
      reason: skipReason,
    }))
    return
  }

  void sendAuthorityReportEmail(payload)
    .then((result) => {
      console.info(JSON.stringify({
        event: "authority_email_sent",
        requestId: payload.requestId,
        reportId: payload.reportId,
        messageId: result?.messageId,
        acceptedCount: result?.acceptedCount ?? 0,
      }))
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "unknown_error"
      console.error(JSON.stringify({
        event: "authority_email_failed",
      stage: "resend_send",
        requestId: payload.requestId,
        reportId: payload.reportId,
        error: message,
      }))
    })
}
