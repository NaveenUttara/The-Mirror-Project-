import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import oracledb from "oracledb";
import { authenticateRequest } from "@/lib/auth";
import { getConnection } from "@/lib/db";
import { hasOracleConfig } from "@/lib/demo-reports";
import { notifyRepairUpdateSubmitted } from "@/lib/report-notify-email";
import {
  deleteReportPhoto,
  isMissingR2Object,
  loadLegacyLocalReportPhoto,
  loadReportPhoto,
  saveReportPhoto,
} from "@/lib/report-storage";

export const runtime = "nodejs";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

type RepairReportRow = {
  id: number;
  potholeId: number;
  reportId: string;
  potholePublicId: string;
  currentStatus: string;
  latitude: number;
  longitude: number;
  severity: string;
  description: string | null;
  citizenName: string;
  citizenPhone: string;
  citizenEmail: string | null;
};

type BeforePhotoRow = { objectKey: string; mimeType: string };

export async function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  let savedObjectKey: string | undefined;
  let photoCommitted = false;

  try {
    const user = await authenticateRequest(request);
    if (!hasOracleConfig()) {
      return NextResponse.json(
        { error: "Road repair photo updates are not available for this report storage yet" },
        { status: 501 },
      );
    }

    const { reportId } = await context.params;
    if (!/^MIR-RPT-[A-Z0-9-]{8,80}$/i.test(reportId)) {
      return NextResponse.json({ error: "Invalid report ID" }, { status: 400 });
    }

    const formData = await request.formData();
    const photoValue = formData.get("photo");
    const copyEmail = String(formData.get("copyEmail") || "").trim().toLowerCase();
    if (!(photoValue instanceof File) || !PHOTO_TYPES.has(photoValue.type)) {
      return NextResponse.json({ error: "Choose a JPEG, PNG or WebP after photo" }, { status: 400 });
    }
    if (photoValue.size <= 0 || photoValue.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "The after photo must be no larger than 5 MB" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(copyEmail)) {
      return NextResponse.json({ error: "Enter a valid email address to receive your copy" }, { status: 400 });
    }

    const connection = await getConnection();
    let report: RepairReportRow | undefined;
    let beforePhoto: BeforePhotoRow | undefined;
    let photoId: number | undefined;
    const photoBytes = new Uint8Array(await photoValue.arrayBuffer());
    const extension = PHOTO_EXTENSIONS[photoValue.type];
    savedObjectKey = `report-photos/${randomUUID()}${extension}`;

    try {
      const reportResult = await connection.execute<RepairReportRow>(
        `SELECT r.id AS "id",
                p.id AS "potholeId",
                r.report_id AS "reportId",
                p.public_id AS "potholePublicId",
                p.current_status AS "currentStatus",
                p.latitude AS "latitude",
                p.longitude AS "longitude",
                p.severity AS "severity",
                r.description AS "description",
                u.name AS "citizenName",
                u.phone AS "citizenPhone",
                u.email AS "citizenEmail"
           FROM MIRROR_REPORTS r
           JOIN MIRROR_POTHOLES p ON p.id = r.pothole_id
           JOIN MIRROR_USERS u ON u.id = r.citizen_id
          WHERE r.report_id = :reportId
            AND r.citizen_id = :userId`,
        { reportId, userId: user.userId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      report = reportResult.rows?.[0];
      if (!report) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }

      const beforeResult = await connection.execute<BeforePhotoRow>(
        `SELECT object_key AS "objectKey", mime_type AS "mimeType"
           FROM MIRROR_REPORT_PHOTOS
          WHERE report_id = :reportInternalId
            AND evidence_type = 'before'
          ORDER BY id
          FETCH FIRST 1 ROWS ONLY`,
        { reportInternalId: report.id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      beforePhoto = beforeResult.rows?.[0];
      if (!beforePhoto) {
        return NextResponse.json({ error: "The original report photo is unavailable" }, { status: 409 });
      }

      await saveReportPhoto(savedObjectKey, photoBytes, photoValue.type);
      const sequenceResult = await connection.execute<{ photoId: number }>(
        `SELECT MIRROR_PHOTOS_SEQ.NEXTVAL AS "photoId" FROM DUAL`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      photoId = sequenceResult.rows?.[0]?.photoId;
      if (!photoId) throw new Error("Could not generate photo identifier");

      await connection.execute(
        `INSERT INTO MIRROR_REPORT_PHOTOS
           (id, report_id, object_key, mime_type, file_size, evidence_type)
         VALUES
           (:id, :reportId, :objectKey, :mimeType, :fileSize, 'after')`,
        {
          id: photoId,
          reportId: report.id,
          objectKey: savedObjectKey,
          mimeType: photoValue.type,
          fileSize: photoValue.size,
        },
      );
      await connection.execute(
        `INSERT INTO MIRROR_AUDIT_LOGS
           (id, actor_user_id, action, entity_type, entity_id, details)
         VALUES
           (MIRROR_AUDIT_SEQ.NEXTVAL, :userId, 'repair_evidence_submitted', 'report', :reportId, :details)`,
        {
          userId: user.userId,
          reportId,
          details: JSON.stringify({ photoId, evidenceType: "after" }),
        },
      );
      if (report.currentStatus !== "closed") {
        await connection.execute(
          `UPDATE MIRROR_POTHOLES
              SET current_status = 'closed', updated_at = SYSTIMESTAMP
            WHERE id = :potholeId`,
          { potholeId: report.potholeId },
        );
        await connection.execute(
          `INSERT INTO MIRROR_STATUS_HISTORY
             (id, report_id, old_status, new_status, changed_by, comments)
           VALUES
             (MIRROR_STATUS_SEQ.NEXTVAL, :reportId, :oldStatus, 'closed', :changedBy, :comments)`,
          {
            reportId: report.id,
            oldStatus: report.currentStatus,
            changedBy: user.userId,
            comments: "Closed after citizen submitted a road-fixed photo",
          },
        );
      }
      await connection.commit();
      photoCommitted = true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.close();
    }

    const beforeBytes = await loadReportPhoto(beforePhoto!.objectKey).catch(async (error: unknown) => {
      if (isMissingR2Object(error)) return loadLegacyLocalReportPhoto(beforePhoto!.objectKey);
      throw error;
    });
    const emailStatus = await notifyRepairUpdateSubmitted({
      reportId: report!.reportId,
      potholePublicId: report!.potholePublicId,
      latitude: report!.latitude,
      longitude: report!.longitude,
      severity: report!.severity,
      description: report!.description,
      citizenName: report!.citizenName,
      citizenPhone: report!.citizenPhone,
      citizenEmail: copyEmail,
      beforePhoto: {
        filename: `report-${report!.reportId}-before${PHOTO_EXTENSIONS[beforePhoto!.mimeType] || ".jpg"}`,
        mimeType: beforePhoto!.mimeType,
        bytes: beforeBytes,
      },
      afterPhoto: {
        filename: `report-${report!.reportId}-after${extension}`,
        mimeType: photoValue.type,
        bytes: photoBytes,
      },
    });

    return NextResponse.json({
      success: true,
      reportId: report!.reportId,
      afterPhotoUrl: `/api/report-photos/${photoId}`,
      status: "closed",
      emailStatus,
    }, { status: 201 });
  } catch (error) {
    if (savedObjectKey && !photoCommitted) await deleteReportPhoto(savedObjectKey).catch(() => undefined);
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Please sign in to update your report" }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
