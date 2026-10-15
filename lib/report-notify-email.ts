import {
  isInsideBengaluruServiceArea,
  resolveBbmpNotificationRecipients,
  type BbmpZoneMatch,
} from "@/lib/bbmp-zone-mail";
import { sendResendToEachRecipient } from "@/lib/resend-delivery";

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

export type RepairUpdateEmailPayload = {
  reportId: string;
  potholePublicId: string;
  latitude: number;
  longitude: number;
  severity: string;
  description: string | null;
  citizenName: string;
  citizenPhone: string;
  citizenEmail: string;
  beforePhoto: NonNullable<ReportNotifyPayload["photo"]>;
  afterPhoto: NonNullable<ReportNotifyPayload["photo"]>;
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
  return reportEmailSkipReason() === null;
}

function reportEmailSkipReason(): string | null {
  if (process.env.BBMP_EMAIL_ENABLED === "false") {
    return "disabled";
  }

  const missing = ["RESEND_API_KEY", "REPORT_EMAIL_FROM"]
    .filter((name) => !process.env[name]?.trim());
  return missing.length ? `missing_${missing.join("_")}` : null;
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
  if (process.env.BBMP_EMAIL_ENABLED === "false") {
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

  const subject = `[Mirror → BBMP] ${zoneLabel} — ${payload.reportId} (${payload.severity})`;
  const html = buildHtml(payload, zone);
  const { results, acceptedCount } = await sendResendToEachRecipient({
    apiKey,
    from,
    recipients,
    subject,
    html,
    attachments,
  });

  for (const result of results) {
    if (result.ok) {
      console.info(JSON.stringify({
        event: "report_email_recipient_sent",
        provider: "resend",
        reportId: payload.reportId,
        recipient: result.recipient,
        messageId: result.messageId,
      }));
    } else {
      console.error(JSON.stringify({
        event: "report_email_recipient_failed",
        provider: "resend",
        reportId: payload.reportId,
        recipient: result.recipient,
        error: result.error,
      }));
    }
  }

  if (acceptedCount === 0) {
    const detail = results.map((entry) => `${entry.recipient}: ${entry.error}`).join("; ");
    throw new Error(detail || "no_recipients");
  }

  console.info(JSON.stringify({
    event: "report_email_sent",
    provider: "resend",
    reportId: payload.reportId,
    acceptedCount,
  }));
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
  const skipReason = reportEmailSkipReason();
  if (skipReason) {
    console.warn(JSON.stringify({
      event: "report_email_skipped",
      provider: "resend",
      reportId: payload.reportId,
      reason: skipReason,
    }));
    return;
  }

  try {
    await sendReportNotificationEmail(payload);
  } catch (error) {
    console.error(JSON.stringify({
      event: "report_email_failed",
      provider: "resend",
      reportId: payload.reportId,
      error: error instanceof Error ? error.message : "unknown_error",
    }));
  }
}

export async function notifyRepairUpdateSubmitted(payload: RepairUpdateEmailPayload): Promise<"sent" | "skipped" | "failed"> {
  const skipReason = reportEmailSkipReason();
  if (skipReason) {
    console.warn(JSON.stringify({
      event: "repair_update_email_skipped",
      provider: "resend",
      reportId: payload.reportId,
      reason: skipReason,
    }));
    return "skipped";
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.REPORT_EMAIL_FROM?.trim();
  if (!apiKey || !from) return "skipped";

  const { recipients, zone } = resolveBbmpNotificationRecipients(
    payload.latitude,
    payload.longitude,
    parseExtraRecipientList(),
  );
  const zoneLabel = zone ? zone.zoneName : "Central BBMP";
  const escapedDescription = (payload.description || "(No description provided)")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const attachments = [payload.beforePhoto, payload.afterPhoto].map((photo) => ({
    filename: photo.filename,
    content: Buffer.from(photo.bytes).toString("base64"),
  }));

  const repairHtml = `
          <h2>Citizen-submitted road repair update — The Mirror Project → BBMP</h2>
          <p>The citizen submitted a current road-fixed photo. The Mirror Project has closed this report; please verify the road condition and contact the citizen if further action is required.</p>
          <p><strong>Report ID:</strong> ${payload.reportId}</p>
          <p><strong>Pothole ID:</strong> ${payload.potholePublicId}</p>
          <p><strong>Severity:</strong> ${payload.severity}</p>
          <p><strong>BBMP zone:</strong> ${zoneLabel}</p>
          <p><strong>Location:</strong> ${payload.latitude}, ${payload.longitude}</p>
          <p><a href="${mapsLink(payload.latitude, payload.longitude)}">Open in Google Maps</a></p>
          <p><strong>Original description:</strong> ${escapedDescription}</p>
          <p><strong>Attachments:</strong> Before photo and citizen-submitted after photo.</p>
          <hr />
          <p><strong>Citizen:</strong> ${payload.citizenName}</p>
          <p><strong>Phone:</strong> ${payload.citizenPhone}</p>
          <p><strong>Email:</strong> ${payload.citizenEmail}</p>
        `.trim();
  const repairSubject = `[Mirror → BBMP] Road repair photo update — ${payload.reportId}`;

  try {
    const authoritySend = await sendResendToEachRecipient({
      apiKey,
      from,
      recipients,
      subject: repairSubject,
      html: repairHtml,
      attachments,
    });

    const citizenSend = await sendResendToEachRecipient({
      apiKey,
      from,
      recipients: [payload.citizenEmail],
      subject: repairSubject,
      html: repairHtml,
      attachments,
    });

    const acceptedCount = authoritySend.acceptedCount + citizenSend.acceptedCount;
    if (authoritySend.acceptedCount === 0) {
      const detail = authoritySend.results.map((entry) => `${entry.recipient}: ${entry.error}`).join("; ");
      throw new Error(detail || "no_recipients");
    }

    console.info(JSON.stringify({
      event: "repair_update_email_sent",
      provider: "resend",
      reportId: payload.reportId,
      authorityAcceptedCount: authoritySend.acceptedCount,
      citizenCopySent: citizenSend.acceptedCount > 0,
      acceptedCount,
    }));
    return "sent";
  } catch (error) {
    console.error(JSON.stringify({
      event: "repair_update_email_failed",
      provider: "resend",
      reportId: payload.reportId,
      error: error instanceof Error ? error.message : "unknown_error",
    }));
    return "failed";
  }
}
