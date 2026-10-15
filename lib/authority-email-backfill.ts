import oracledb from "oracledb";
import { getConnection } from "@/lib/db";
import { hasOracleConfig } from "@/lib/demo-reports";
import { isPostgresConfigured } from "@/lib/mirror-postgres";
import { getSql } from "@/lib/postgres-config";
import {
  isMissingR2Object,
  loadLegacyLocalReportPhoto,
  loadReportPhoto,
} from "@/lib/report-storage";
import {
  isReportEmailNotifyConfigured,
  photoAttachmentFromFile,
  sendReportNotificationEmail,
  type ReportNotifyPayload,
} from "@/lib/report-notify-email";

export type AuthorityEmailBackfillOptions = {
  dryRun?: boolean;
  excludeReportIds?: string[];
  onlyReportIds?: string[];
  limit?: number;
  offset?: number;
  delayMs?: number;
};

export type AuthorityEmailBackfillRow = {
  reportId: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  sentCount?: number;
};

export type AuthorityEmailBackfillResult = {
  storage: "oracle" | "postgres" | "none";
  emailConfigured: boolean;
  matched: number;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  nextOffset: number;
  results: AuthorityEmailBackfillRow[];
};

function normalizeReportId(reportId: string): string {
  return reportId.trim().toUpperCase();
}

export function shouldBackfillReportId(
  reportId: string,
  options: AuthorityEmailBackfillOptions,
): boolean {
  const id = normalizeReportId(reportId);
  const exclude = new Set((options.excludeReportIds ?? []).map(normalizeReportId));
  if (exclude.has(id)) {
    return false;
  }

  const only = options.onlyReportIds?.map(normalizeReportId).filter(Boolean) ?? [];
  if (only.length > 0) {
    return only.includes(id);
  }

  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadOraclePhoto(objectKey: string, mimeType: string) {
  try {
    const bytes = await loadReportPhoto(objectKey);
    return photoAttachmentFromFile(
      { type: mimeType, name: "pothole-evidence" } as File,
      bytes,
    );
  } catch (error) {
    if (!isMissingR2Object(error)) {
      throw error;
    }
    const bytes = await loadLegacyLocalReportPhoto(objectKey);
    return photoAttachmentFromFile(
      { type: mimeType, name: "pothole-evidence" } as File,
      bytes,
    );
  }
}

type OracleBackfillRow = {
  reportId: string;
  potholePublicId: string;
  latitude: number;
  longitude: number;
  severity: string;
  description: string | null;
  citizenName: string;
  citizenPhone: string;
  citizenEmail: string | null;
  objectKey: string | null;
  mimeType: string | null;
};

async function listOracleBackfillRows(): Promise<OracleBackfillRow[]> {
  const connection = await getConnection();
  try {
    const result = await connection.execute<OracleBackfillRow>(
      `SELECT r.report_id AS "reportId",
              p.public_id AS "potholePublicId",
              p.latitude AS "latitude",
              p.longitude AS "longitude",
              p.severity AS "severity",
              r.description AS "description",
              u.name AS "citizenName",
              u.phone AS "citizenPhone",
              u.email AS "citizenEmail",
              (
                SELECT rp.object_key
                  FROM MIRROR_REPORT_PHOTOS rp
                 WHERE rp.report_id = r.id
                   AND rp.evidence_type = 'before'
                 ORDER BY rp.id ASC
                 FETCH FIRST 1 ROW ONLY
              ) AS "objectKey",
              (
                SELECT rp.mime_type
                  FROM MIRROR_REPORT_PHOTOS rp
                 WHERE rp.report_id = r.id
                   AND rp.evidence_type = 'before'
                 ORDER BY rp.id ASC
                 FETCH FIRST 1 ROW ONLY
              ) AS "mimeType"
         FROM MIRROR_REPORTS r
         JOIN MIRROR_POTHOLES p ON p.id = r.pothole_id
         JOIN MIRROR_USERS u ON u.id = r.citizen_id
        ORDER BY r.submitted_at ASC`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return result.rows ?? [];
  } finally {
    await connection.close();
  }
}

type PostgresBackfillRow = OracleBackfillRow;

async function listPostgresBackfillRows(): Promise<PostgresBackfillRow[]> {
  const sql = getSql();
  return await sql`
    SELECT r.report_id AS "reportId",
           p.id AS "potholePublicId",
           p.latitude AS "latitude",
           p.longitude AS "longitude",
           p.severity AS "severity",
           r.description AS "description",
           u.name AS "citizenName",
           u.phone AS "citizenPhone",
           u.email AS "citizenEmail",
           (
             SELECT ph.storage_key
               FROM mirror_report_photo ph
              WHERE ph.report_id = r.id
                AND ph.deleted_at IS NULL
              ORDER BY ph.created_at ASC
              LIMIT 1
           ) AS "objectKey",
           (
             SELECT ph.mime_type
               FROM mirror_report_photo ph
              WHERE ph.report_id = r.id
                AND ph.deleted_at IS NULL
              ORDER BY ph.created_at ASC
              LIMIT 1
           ) AS "mimeType"
      FROM mirror_report r
      JOIN mirror_pothole p ON p.id = r.pothole_id
      JOIN mirror_user u ON u.id = r.citizen_id
     WHERE r.deleted_at IS NULL
       AND p.deleted_at IS NULL
       AND u.deleted_at IS NULL
     ORDER BY r.submitted_at ASC
  ` as PostgresBackfillRow[];
}

async function buildPayload(row: OracleBackfillRow): Promise<ReportNotifyPayload> {
  let photo: ReportNotifyPayload["photo"];
  if (row.objectKey && row.mimeType) {
    photo = await loadOraclePhoto(row.objectKey, row.mimeType);
  }

  return {
    reportId: row.reportId,
    potholePublicId: row.potholePublicId,
    latitude: row.latitude,
    longitude: row.longitude,
    severity: row.severity,
    description: row.description,
    citizenName: row.citizenName,
    citizenPhone: row.citizenPhone,
    citizenEmail: row.citizenEmail,
    photo,
  };
}

async function sendOnePayload(payload: ReportNotifyPayload): Promise<void> {
  await sendReportNotificationEmail(payload);
}

export async function runAuthorityEmailBackfill(
  options: AuthorityEmailBackfillOptions = {},
): Promise<AuthorityEmailBackfillResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const offset = Math.max(options.offset ?? 0, 0);
  const delayMs = Math.max(options.delayMs ?? 700, 0);
  const emailConfigured = isReportEmailNotifyConfigured();

  let storage: AuthorityEmailBackfillResult["storage"] = "none";
  let rows: OracleBackfillRow[] = [];

  if (isPostgresConfigured()) {
    storage = "postgres";
    rows = await listPostgresBackfillRows();
  } else if (hasOracleConfig()) {
    storage = "oracle";
    rows = await listOracleBackfillRows();
  }

  const eligible = rows.filter((row) => shouldBackfillReportId(row.reportId, options));
  const slice = eligible.slice(offset, offset + limit);

  const results: AuthorityEmailBackfillRow[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  if (options.dryRun) {
    for (const row of slice) {
      results.push({ reportId: row.reportId, ok: true, skipped: true });
      skipped += 1;
    }

    return {
      storage,
      emailConfigured,
      matched: eligible.length,
      processed: slice.length,
      sent: 0,
      failed: 0,
      skipped: slice.length,
      nextOffset: offset + slice.length,
      results,
    };
  }

  if (!emailConfigured) {
    throw new Error("Report email is not configured (RESEND_API_KEY and REPORT_EMAIL_FROM)");
  }

  for (const row of slice) {
    try {
      const payload = await buildPayload(row);
      await sendOnePayload(payload);
      results.push({ reportId: row.reportId, ok: true, sentCount: 1 });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      results.push({ reportId: row.reportId, ok: false, error: message });
      failed += 1;
    }

    if (delayMs > 0) {
      await delay(delayMs);
    }
  }

  return {
    storage,
    emailConfigured,
    matched: eligible.length,
    processed: slice.length,
    sent,
    failed,
    skipped,
    nextOffset: offset + slice.length,
    results,
  };
}
