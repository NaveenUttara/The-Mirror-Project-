import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { AuthenticatedUser } from "@/lib/auth";
import {
  createSessionToken,
  hashSessionToken,
  mirrorEntityId,
  normalizePhone,
} from "@/lib/mirror-session";
import { getSql, isPostgresConfigured } from "@/lib/postgres-config";
import { validateReportSubmission } from "@/lib/demo-reports";
import {
  deleteReportPhoto,
  isMissingR2Object,
  loadLegacyLocalReportPhoto,
  loadReportPhoto,
  saveReportPhoto,
} from "@/lib/report-storage";

export { isPostgresConfigured };

const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

type MirrorUserRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
};

type ReportListRow = {
  reportId: string;
  potholePublicId: string;
  latitude: number;
  longitude: number;
  severity: string;
  status: string;
  submittedAt: string;
  photoId: string | null;
};

export async function authenticatePostgresSession(token: string): Promise<AuthenticatedUser> {
  const rows = await getSql()`
    SELECT u.id, u.phone, u.role
      FROM mirror_session s
      JOIN mirror_user u ON u.id = s.user_id
     WHERE s.token_hash = ${hashSessionToken(token)}
       AND s.deleted_at IS NULL
       AND u.deleted_at IS NULL
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     LIMIT 1
  ` as Array<{ id: string; phone: string; role: string }>;

  const user = rows[0];
  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  return {
    userId: user.id,
    phone: user.phone,
    role: user.role || "citizen",
  };
}

export async function loginPostgresUser(
  phone: string,
  name: string,
  email: string | null,
) {
  const normalizedPhone = normalizePhone(phone);
  const sql = getSql();
  const existingRows = await sql`
    SELECT id, name, phone, email, role
      FROM mirror_user
     WHERE phone = ${normalizedPhone}
       AND deleted_at IS NULL
     LIMIT 1
  ` as MirrorUserRow[];

  let user = existingRows[0];

  if (user) {
    const updatedRows = await sql`
      UPDATE mirror_user
         SET name = ${name},
             email = ${email},
             phone_verified = true,
             updated_at = NOW()
       WHERE id = ${user.id}
       RETURNING id, name, phone, email, role
    ` as MirrorUserRow[];
    user = updatedRows[0];
  } else {
    const userId = mirrorEntityId("musr");
    const createdRows = await sql`
      INSERT INTO mirror_user (id, name, phone, email, role, phone_verified)
      VALUES (${userId}, ${name}, ${normalizedPhone}, ${email}, 'citizen', true)
      RETURNING id, name, phone, email, role
    ` as MirrorUserRow[];
    user = createdRows[0];
  }

  const { token, tokenHash } = createSessionToken();
  const sessionId = mirrorEntityId("mses");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await sql`
    INSERT INTO mirror_session (id, token_hash, expires_at, revoked_at, user_id)
    VALUES (${sessionId}, ${tokenHash}, ${expiresAt}, NULL, ${user.id})
  `;

  return {
    success: true,
    message: "Login successful",
    token,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
    },
  };
}

export async function submitPostgresReport(user: AuthenticatedUser, formData: FormData) {
  const validated = validateReportSubmission(formData);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const photoCapturedAt = formData.get("photoCapturedAt");
  const locationCapturedAt = formData.get("locationCapturedAt");
  const locationAccuracy = Number(formData.get("locationAccuracy"));
  const photoTime = Date.parse(String(photoCapturedAt));
  const locationTime = Date.parse(String(locationCapturedAt));

  const objectKey = `report-photos/${randomUUID()}${PHOTO_EXTENSIONS[validated.photoValue.type]}`;

  try {
    await saveReportPhoto(
      objectKey,
      new Uint8Array(await validated.photoValue.arrayBuffer()),
      validated.photoValue.type,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save photograph";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const sql = getSql();
  const potholeId = mirrorEntityId("mpot");
  const reportInternalId = mirrorEntityId("mrpt");
  const photoId = mirrorEntityId("mpho");
  const statusHistoryId = mirrorEntityId("msts");
  const auditLogId = mirrorEntityId("maud");
  const publicReportId = `MIR-RPT-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const submittedAt = new Date().toISOString();

  try {
    await sql`
      INSERT INTO mirror_pothole (id, latitude, longitude, address, severity, status)
      VALUES (
        ${potholeId},
        ${validated.latitude},
        ${validated.longitude},
        NULL,
        ${validated.severity},
        'submitted'
      )
    `;

    await sql`
      INSERT INTO mirror_report (
        id, report_id, description, status, submitted_at, citizen_id, pothole_id
      )
      VALUES (
        ${reportInternalId},
        ${publicReportId},
        ${validated.description},
        'submitted',
        ${submittedAt},
        ${user.userId},
        ${potholeId}
      )
    `;

    await sql`
      INSERT INTO mirror_report_photo (
        id,
        storage_key,
        original_name,
        mime_type,
        size_bytes,
        captured_latitude,
        captured_longitude,
        captured_accuracy_meters,
        captured_at,
        confirmed_latitude,
        confirmed_longitude,
        confirmed_accuracy_meters,
        distance_meters,
        within_100_meters,
        report_id
      )
      VALUES (
        ${photoId},
        ${objectKey},
        ${validated.photoValue.name || "pothole-photo"},
        ${validated.photoValue.type},
        ${validated.photoValue.size},
        ${validated.latitude},
        ${validated.longitude},
        ${locationAccuracy},
        ${new Date(photoTime).toISOString()},
        ${validated.latitude},
        ${validated.longitude},
        ${locationAccuracy},
        0,
        true,
        ${reportInternalId}
      )
    `;

    await sql`
      INSERT INTO mirror_status_history (
        id, from_status, to_status, note, changed_by_user_id, changed_at, report_id
      )
      VALUES (
        ${statusHistoryId},
        NULL,
        'submitted',
        'Report submitted by citizen',
        ${user.userId},
        ${submittedAt},
        ${reportInternalId}
      )
    `;

    await sql`
      INSERT INTO mirror_audit_log (
        id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        details,
        ip_address,
        occurred_at,
        report_id
      )
      VALUES (
        ${auditLogId},
        ${user.userId},
        'report_created',
        'report',
        ${publicReportId},
        ${JSON.stringify({
          latitude: validated.latitude,
          longitude: validated.longitude,
          locationAccuracy,
          photoCapturedAt,
          locationCapturedAt,
        })},
        NULL,
        ${submittedAt},
        ${reportInternalId}
      )
    `;
  } catch (error) {
    await deleteReportPhoto(objectKey).catch(() => undefined);
    throw error;
  }

  return NextResponse.json({
    success: true,
    reportId: publicReportId,
    potholeId,
    status: "submitted",
  }, { status: 201 });
}

export async function listPostgresReports(user: AuthenticatedUser) {
  const sql = getSql();
  const userRows = await sql`
    SELECT name
      FROM mirror_user
     WHERE id = ${user.userId}
       AND deleted_at IS NULL
     LIMIT 1
  ` as Array<{ name: string }>;

  const reportRows = await sql`
    SELECT r.report_id AS "reportId",
           p.id AS "potholePublicId",
           p.latitude AS "latitude",
           p.longitude AS "longitude",
           p.severity AS "severity",
           r.status AS "status",
           r.submitted_at AS "submittedAt",
           (
             SELECT ph.id
               FROM mirror_report_photo ph
              WHERE ph.report_id = r.id
                AND ph.deleted_at IS NULL
              ORDER BY ph.created_at ASC
              LIMIT 1
           ) AS "photoId"
      FROM mirror_report r
      JOIN mirror_pothole p ON p.id = r.pothole_id
     WHERE r.citizen_id = ${user.userId}
       AND r.deleted_at IS NULL
       AND p.deleted_at IS NULL
     ORDER BY r.submitted_at DESC
  ` as ReportListRow[];

  return NextResponse.json({
    user: { name: userRows[0]?.name || "Citizen" },
    reports: reportRows.map((report) => ({
      reportId: report.reportId,
      potholePublicId: report.potholePublicId,
      latitude: report.latitude,
      longitude: report.longitude,
      severity: report.severity,
      status: report.status,
      submittedAt: report.submittedAt,
      photoUrl: report.photoId ? `/api/report-photos/${report.photoId}` : null,
    })),
  });
}

export async function getPostgresPublicImpact() {
  const sql = getSql();
  const counts = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted,
      COUNT(*) FILTER (WHERE status = 'under_verification')::int AS under_verification,
      COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE status = 'repaired')::int AS repaired
    FROM mirror_report
    WHERE deleted_at IS NULL
  ` as Array<{
    total: number;
    submitted: number;
    under_verification: number;
    in_progress: number;
    repaired: number;
  }>;

  const issues = await sql`
    SELECT id, latitude, longitude, severity, status
      FROM mirror_pothole
     WHERE deleted_at IS NULL
       AND status <> 'rejected'
     ORDER BY created_at DESC
     LIMIT 100
  ` as Array<{
    id: string;
    latitude: number;
    longitude: number;
    severity: string;
    status: string;
  }>;

  const totals = counts[0] || {
    total: 0,
    submitted: 0,
    under_verification: 0,
    in_progress: 0,
    repaired: 0,
  };

  return {
    totalReports: totals.total,
    underReview: totals.submitted + totals.under_verification,
    inProgress: totals.in_progress,
    repaired: totals.repaired,
    issues,
  };
}

export async function loadPostgresPhoto(photoId: string, userId: string) {
  const sql = getSql();
  const rows = await sql`
    SELECT ph.storage_key AS "storageKey", ph.mime_type AS "mimeType"
      FROM mirror_report_photo ph
      JOIN mirror_report r ON r.id = ph.report_id
     WHERE ph.id = ${photoId}
       AND r.citizen_id = ${userId}
       AND ph.deleted_at IS NULL
       AND r.deleted_at IS NULL
     LIMIT 1
  ` as Array<{ storageKey: string; mimeType: string }>;

  const photo = rows[0];
  if (!photo) {
    return undefined;
  }

  const bytes = await loadReportPhoto(photo.storageKey).catch(async (error: unknown) => {
    if (isMissingR2Object(error)) {
      return loadLegacyLocalReportPhoto(photo.storageKey);
    }
    throw error;
  });

  return { bytes, mimeType: photo.mimeType };
}
