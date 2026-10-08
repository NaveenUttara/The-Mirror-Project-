import nodemailer from "nodemailer"
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

export function isAuthorityEmailConfigured(): boolean {
  if (process.env.BBMP_EMAIL_ENABLED === "false") {
    return false
  }

  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  return Boolean(host && user && pass)
}

function createTransport(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST?.trim()
  const port = Number(process.env.SMTP_PORT || "587")
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()

  if (!host || !user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

export async function sendAuthorityReportEmail(payload: AuthorityReportEmailPayload): Promise<void> {
  if (!isAuthorityEmailConfigured()) {
    return
  }

  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim()
  if (!from) {
    return
  }

  const { to, cc, zone } = resolveBbmpMailTargets(
    payload.latitude,
    payload.longitude,
    parseExtraRecipientList(),
  )

  const zoneLabel = zone ? zone.zoneName : "Central BBMP"
  const attachments = payload.photo
    ? [{
      filename: payload.photo.filename,
      content: payload.photo.buffer,
      contentType: payload.photo.mimeType,
    }]
    : undefined

  const transport = createTransport()
  if (!transport) {
    return
  }

  await transport.sendMail({
    from,
    to,
    cc: cc.length ? cc : undefined,
    subject: `[Mirror → BBMP] ${zoneLabel} — ${payload.reportId} (${payload.severity})`,
    html: buildHtml(payload, zone),
    attachments,
  })
}

export function queueAuthorityReportEmail(payload: AuthorityReportEmailPayload): void {
  if (!isAuthorityEmailConfigured()) {
    return
  }

  void sendAuthorityReportEmail(payload)
    .then(() => {
      console.info(JSON.stringify({
        event: "authority_email_sent",
        requestId: payload.requestId,
        reportId: payload.reportId,
      }))
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "unknown_error"
      console.error(JSON.stringify({
        event: "authority_email_failed",
        stage: "smtp_send",
        requestId: payload.requestId,
        reportId: payload.reportId,
        error: message,
      }))
    })
}
