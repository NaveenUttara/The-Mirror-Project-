import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import oracledb from "oracledb";
import { authenticateRequest } from "@/lib/auth";
import { getConnection } from "@/lib/db";
import {
  hasOracleConfig,
  listDemoReports,
  submitDemoReport,
  validateReportSubmission,
} from "@/lib/demo-reports";
import { deleteReportPhoto, saveReportPhoto } from "@/lib/report-storage";
import { forwardedResponse, getMedusaBackendUrl } from "@/lib/medusa-proxy";
import {
  isPostgresConfigured,
  listPostgresReports,
  submitPostgresReport,
} from "@/lib/mirror-postgres";
import { getBearerToken, isJwtToken, shouldUseMedusaBackend } from "@/lib/token-kind";

export const runtime = "nodejs";

const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

type SequenceRow = {
  potholeId: number;
  reportId: number;
  photoId: number;
  statusId: number;
  auditId: number;
};

type ReportRow = {
  reportId: string;
  potholePublicId: string;
  photoId: number | null;
  latitude: number;
  longitude: number;
  severity: string;
  status: string;
  submittedAt: Date;
};

type UserRow = { name: string };

function apiError(error: unknown) {
  if (error instanceof Error && error.message === "AUTH_REQUIRED") {
    return NextResponse.json(
      { error: "Please sign in before submitting or viewing reports" },
      { status: 401 },
    );
  }

  const message = error instanceof Error ? error.message : "Internal Server Error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  let savedPhotoKey: string | undefined;

  try {
    const formData = await request.formData();
    const medusaUrl = getMedusaBackendUrl();

    if (medusaUrl && shouldUseMedusaBackend(request)) {
      const response = await fetch(`${medusaUrl}/mirror/reports`, {
        method: "POST",
        headers: { Authorization: request.headers.get("authorization") || "" },
        body: formData,
        cache: "no-store",
      });
      if (response.ok) {
        return forwardedResponse(response);
      }
    }

    const user = await authenticateRequest(request);
    const token = getBearerToken(request);

    if (isPostgresConfigured() && !isJwtToken(token)) {
      return await submitPostgresReport(user, formData);
    }

    if (!hasOracleConfig()) {
      return await submitDemoReport(user, formData);
    }

    const validated = validateReportSubmission(formData);
    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const objectKey = `report-photos/${randomUUID()}${PHOTO_EXTENSIONS[validated.photoValue.type]}`;
    savedPhotoKey = objectKey;
    await saveReportPhoto(
      objectKey,
      new Uint8Array(await validated.photoValue.arrayBuffer()),
      validated.photoValue.type,
    );

    const connection = await getConnection();

    try {
      const sequenceResult = await connection.execute<SequenceRow>(
        `SELECT MIRROR_POTHOLES_SEQ.NEXTVAL AS "potholeId",
                MIRROR_REPORTS_SEQ.NEXTVAL AS "reportId",
                MIRROR_PHOTOS_SEQ.NEXTVAL AS "photoId",
                MIRROR_STATUS_SEQ.NEXTVAL AS "statusId",
                MIRROR_AUDIT_SEQ.NEXTVAL AS "auditId"
           FROM DUAL`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const ids = sequenceResult.rows?.[0];

      if (!ids) {
        throw new Error("Could not generate report identifiers");
      }

      const potholePublicId = `MIR-POT-${String(ids.potholeId).padStart(8, "0")}`;
      const citizenReportId = `MIR-RPT-${String(ids.reportId).padStart(8, "0")}`;

      await connection.execute(
        `INSERT INTO MIRROR_POTHOLES
           (id, public_id, latitude, longitude, severity, current_status)
         VALUES
           (:id, :publicId, :latitude, :longitude, :severity, 'reported')`,
        {
          id: ids.potholeId,
          publicId: potholePublicId,
          latitude: validated.latitude,
          longitude: validated.longitude,
          severity: validated.severity,
        },
      );

      await connection.execute(
        `INSERT INTO MIRROR_REPORTS
           (id, report_id, pothole_id, citizen_id, description)
         VALUES
           (:id, :reportId, :potholeId, :citizenId, :description)`,
        {
          id: ids.reportId,
          reportId: citizenReportId,
          potholeId: ids.potholeId,
          citizenId: user.userId,
          description: validated.description,
        },
      );

      await connection.execute(
        `INSERT INTO MIRROR_REPORT_PHOTOS
           (id, report_id, object_key, mime_type, file_size, evidence_type)
         VALUES
           (:id, :reportId, :objectKey, :mimeType, :fileSize, 'before')`,
        {
          id: ids.photoId,
          reportId: ids.reportId,
          objectKey,
          mimeType: validated.photoValue.type,
          fileSize: validated.photoValue.size,
        },
      );

      await connection.execute(
        `INSERT INTO MIRROR_STATUS_HISTORY
           (id, report_id, old_status, new_status, changed_by, comments)
         VALUES
           (:id, :reportId, NULL, 'reported', :changedBy, 'Report submitted by citizen')`,
        { id: ids.statusId, reportId: ids.reportId, changedBy: user.userId },
      );

      await connection.execute(
        `INSERT INTO MIRROR_AUDIT_LOGS
           (id, actor_user_id, action, entity_type, entity_id, details)
         VALUES
           (:id, :actorUserId, 'report_created', 'report', :entityId, :details)`,
        {
          id: ids.auditId,
          actorUserId: user.userId,
          entityId: citizenReportId,
          details: JSON.stringify({
            potholePublicId,
            latitude: validated.latitude,
            longitude: validated.longitude,
            locationAccuracyMetres: Number(formData.get("locationAccuracy")),
          }),
        },
      );

      await connection.commit();

      return NextResponse.json({
        success: true,
        reportId: citizenReportId,
        potholeId: potholePublicId,
        status: "reported",
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.close();
    }
  } catch (error) {
    if (savedPhotoKey) {
      await deleteReportPhoto(savedPhotoKey).catch(() => undefined);
    }
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const medusaUrl = getMedusaBackendUrl();
    if (medusaUrl && shouldUseMedusaBackend(request)) {
      const response = await fetch(`${medusaUrl}/mirror/reports`, {
        headers: { Authorization: request.headers.get("authorization") || "" },
        cache: "no-store",
      });
      if (response.ok) {
        return forwardedResponse(response);
      }
    }

    const user = await authenticateRequest(request);
    const token = getBearerToken(request);

    if (isPostgresConfigured() && !isJwtToken(token)) {
      return await listPostgresReports(user);
    }

    if (!hasOracleConfig()) {
      return await listDemoReports(user);
    }

    const connection = await getConnection();

    try {
      const userResult = await connection.execute<UserRow>(
          `SELECT name AS "name" FROM MIRROR_USERS WHERE id = :userId`,
          { userId: user.userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );
      const reportResult = await connection.execute<ReportRow>(
          `SELECT r.report_id AS "reportId",
                  p.public_id AS "potholePublicId",
                  p.latitude AS "latitude",
                  p.longitude AS "longitude",
                  p.severity AS "severity",
                  p.current_status AS "status",
                  r.submitted_at AS "submittedAt",
                  (SELECT MIN(rp.id)
                     FROM MIRROR_REPORT_PHOTOS rp
                    WHERE rp.report_id = r.id
                      AND rp.evidence_type = 'before') AS "photoId"
             FROM MIRROR_REPORTS r
             JOIN MIRROR_POTHOLES p ON p.id = r.pothole_id
            WHERE r.citizen_id = :userId
            ORDER BY r.submitted_at DESC`,
          { userId: user.userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );

      return NextResponse.json({
        user: { name: userResult.rows?.[0]?.name || "Citizen" },
        reports: (reportResult.rows || []).map((report) => ({
          ...report,
          photoUrl: report.photoId ? `/api/report-photos/${report.photoId}` : null,
        })),
      });
    } finally {
      await connection.close();
    }
  } catch (error) {
    return apiError(error);
  }
}
