import {
  isInsideBengaluruServiceArea,
  resolveBbmpNotificationRecipients,
  type BbmpZoneMatch,
} from "@/lib/bbmp-zone-mail";

export type ReportNotifyPayload = {
  reportId: string;
  potholePublicId: string;
  latitude: number;
  longitude: number;
  severity: string;
  description: string | null;
  citizenName: string;
  citizenPhone: string;
  citizenEmail: string | null;
  photo?: {
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
  };
};

const PHOTO_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function parseExtraRecipientList(): string[] {
  const raw = process.env.REPORT_NOTIFY_EMAILS || "";
  return raw
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));
}

export function isReportEmailNotifyConfigured(): boolean {
  return process.env.BBMP_EMAIL_ENABLED === "true"
    && Boolean(process.env.RESEND_API_KEY?.trim())
    && Boolean(process.env.REPORT_EMAIL_FROM?.trim());
}

function mapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

function buildHtml(payload: ReportNotifyPayload, zone: BbmpZoneMatch | null): string {
  const description = payload.description?.trim() || "(No description provided)";
  const zoneLine = zone
    ? `<p><strong>BBMP zone:</strong> ${zone.zoneName} (${zone.zonalEmail})</p>`
    : isInsideBengaluruServiceArea(payload.latitude, payload.longitude)
      ? "<p><strong>BBMP zone:</strong> Could not be auto-matched — central BBMP only.</p>"
      : "<p><strong>BBMP zone:</strong> Outside configured Bengaluru zones — central BBMP only.</p>";

  return `
    <h2>New pothole complaint — The Mirror Project → BBMP</h2>
    <p><strong>Report ID:</strong> ${payload.reportId}</p>
    <p><strong>Pothole ID:</strong> ${payload.potholePublicId}</p>
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
  `.trim();
}

export async function sendReportNotificationEmail(payload: ReportNotifyPayload): Promise<void> {
  if (process.env.BBMP_EMAIL_ENABLED !== "true") {
    return;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.REPORT_EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    return;
  }

  const { recipients, zone } = resolveBbmpNotificationRecipients(
    payload.latitude,
    payload.longitude,
    parseExtraRecipientList(),
  );

  const attachments = payload.photo
    ? [{
      filename: payload.photo.filename,
      content: Buffer.from(payload.photo.bytes).toString("base64"),
    }]
    : undefined;

  const zoneLabel = zone ? zone.zoneName : "Central BBMP";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `[Mirror → BBMP] ${zoneLabel} — ${payload.reportId} (${payload.severity})`,
      html: buildHtml(payload, zone),
      attachments,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend API ${response.status}: ${detail.slice(0, 500)}`);
  }
}

export function photoAttachmentFromFile(file: File, bytes: Uint8Array) {
  const extension = PHOTO_EXTENSION[file.type] || ".jpg";
  return {
    filename: `pothole-evidence${extension}`,
    mimeType: file.type,
    bytes,
  };
}

export async function notifyReportSubmitted(payload: ReportNotifyPayload): Promise<void> {
  if (!isReportEmailNotifyConfigured()) {
    return;
  }

  try {
    await sendReportNotificationEmail(payload);
  } catch (error) {
    console.error("[report-notify-email]", error);
  }
}
