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

function parseRecipientList(): string[] {
  const raw = process.env.REPORT_NOTIFY_EMAILS || "";
  return raw
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry));
}

export function isReportEmailNotifyConfigured(): boolean {
  const recipients = parseRecipientList();
  return recipients.length > 0
    && Boolean(process.env.RESEND_API_KEY?.trim())
    && Boolean(process.env.REPORT_EMAIL_FROM?.trim());
}

function mapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

function buildHtml(payload: ReportNotifyPayload): string {
  const description = payload.description?.trim() || "(No description provided)";
  return `
    <h2>New pothole report — The Mirror Project</h2>
    <p><strong>Report ID:</strong> ${payload.reportId}</p>
    <p><strong>Pothole ID:</strong> ${payload.potholePublicId}</p>
    <p><strong>Severity:</strong> ${payload.severity}</p>
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
  const recipients = parseRecipientList();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.REPORT_EMAIL_FROM?.trim();

  if (recipients.length === 0 || !apiKey || !from) {
    return;
  }

  const attachments = payload.photo
    ? [{
      filename: payload.photo.filename,
      content: Buffer.from(payload.photo.bytes).toString("base64"),
    }]
    : undefined;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `[Mirror] Pothole report ${payload.reportId} (${payload.severity})`,
      html: buildHtml(payload),
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
