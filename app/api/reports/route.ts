import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import oracledb from "oracledb";
import { authenticateRequest } from "@/lib/auth";
import { getConnection } from "@/lib/db";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);

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

function requiredText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  let savedPhotoPath: string | undefined;

  try {
    const user = authenticateRequest(request);
    const formData = await request.formData();
    const latitudeText = requiredText(formData, "latitude");
    const longitudeText = requiredText(formData, "longitude");
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    const severity = requiredText(formData, "severity").toLowerCase();
    const description = requiredText(formData, "description");
    const photoCapturedAt = requiredText(formData, "photoCapturedAt");
    const locationCapturedAt = requiredText(formData, "locationCapturedAt");
    const locationAccuracy = Number(requiredText(formData, "locationAccuracy"));
    const photoValue = formData.get("photo");

    if (!latitudeText || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return NextResponse.json({ error: "Enter a valid latitude" }, { status: 400 });
    }
    if (!longitudeText || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: "Enter a valid longitude" }, { status: 400 });
    }
    if (!SEVERITIES.has(severity)) {
      return NextResponse.json({ error: "Select a valid severity" }, { status: 400 });
    }
    if (description.length > 2000) {
      return NextResponse.json(
        { error: "Description must be 2000 characters or fewer" },
        { status: 400 },
      );
    }
    const photoCaptureTime = Date.parse(photoCapturedAt);
    const locationCaptureTime = Date.parse(locationCapturedAt);
    const now = Date.now();
    if (
      !Number.isFinite(photoCaptureTime)
      || !Number.isFinite(locationCaptureTime)
      || now - photoCaptureTime > 15 * 60 * 1000
      || now - locationCaptureTime > 15 * 60 * 1000
      || photoCaptureTime - now > 60 * 1000
      || locationCaptureTime - now > 60 * 1000
      || Math.abs(photoCaptureTime - locationCaptureTime) > 2 * 60 * 1000
    ) {
      return NextResponse.json(
        { error: "Take a fresh photo and capture its location again" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(locationAccuracy) || locationAccuracy <= 0 || locationAccuracy > 100) {
      return NextResponse.json(
        { error: "GPS accuracy must be within 100 metres" },
        { status: 400 },
      );
    }
    if (!(photoValue instanceof File) || photoValue.size === 0) {
      return NextResponse.json({ error: "A pothole photograph is required" }, { status: 400 });
    }
    const extension = PHOTO_EXTENSIONS[photoValue.type];
    if (!extension) {
      return NextResponse.json(
        { error: "Photograph must be a JPEG, PNG or WebP image" },
        { status: 400 },
      );
    }
    if (photoValue.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: "Photograph must be 5 MB or smaller" },
        { status: 400 },
      );
    }

    const objectKey = `report-photos/${randomUUID()}${extension}`;
    const storageRoot = process.env.REPORT_UPLOAD_DIR
      ? path.resolve(process.env.REPORT_UPLOAD_DIR)
      : path.join(process.cwd(), "storage");
    savedPhotoPath = path.join(storageRoot, objectKey);
    await mkdir(path.dirname(savedPhotoPath), { recursive: true });
    await writeFile(savedPhotoPath, Buffer.from(await photoValue.arrayBuffer()));

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
        { id: ids.potholeId, publicId: potholePublicId, latitude, longitude, severity },
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
          description: description || null,
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
          mimeType: photoValue.type,
          fileSize: photoValue.size,
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
            latitude,
            longitude,
            locationAccuracyMetres: locationAccuracy,
            photoCapturedAt,
            locationCapturedAt,
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
    if (savedPhotoPath) {
      await unlink(savedPhotoPath).catch(() => undefined);
    }
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const user = authenticateRequest(request);
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
                  r.submitted_at AS "submittedAt"
             FROM MIRROR_REPORTS r
             JOIN MIRROR_POTHOLES p ON p.id = r.pothole_id
            WHERE r.citizen_id = :userId
            ORDER BY r.submitted_at DESC`,
          { userId: user.userId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT },
        );

      return NextResponse.json({
        user: { name: userResult.rows?.[0]?.name || "Citizen" },
        reports: reportResult.rows || [],
      });
    } finally {
      await connection.close();
    }
  } catch (error) {
    return apiError(error);
  }
}
