import { NextResponse } from "next/server";
import {
  createDemoReport,
  demoReportPhotoUrl,
  findDemoUserById,
  getDemoPublicImpact,
  listDemoReportsForUser,
} from "@/lib/demo-store";
import { authenticateRequest, type AuthenticatedUser } from "@/lib/auth";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function requiredText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function validateReportSubmission(formData: FormData) {
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
    return { error: "Enter a valid latitude" };
  }
  if (!longitudeText || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: "Enter a valid longitude" };
  }
  if (!SEVERITIES.has(severity)) {
    return { error: "Select a valid severity" };
  }
  if (description.length > 2000) {
    return { error: "Description must be 2000 characters or fewer" };
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
    return { error: "Take a fresh photo and capture its location again" };
  }
  if (!Number.isFinite(locationAccuracy) || locationAccuracy <= 0 || locationAccuracy > 100) {
    return { error: "GPS accuracy must be within 100 metres" };
  }
  if (!(photoValue instanceof File) || photoValue.size === 0) {
    return { error: "A pothole photograph is required" };
  }
  if (!PHOTO_EXTENSIONS[photoValue.type]) {
    return { error: "Photograph must be a JPEG, PNG or WebP image" };
  }
  if (photoValue.size > MAX_PHOTO_BYTES) {
    return { error: "Photograph must be 5 MB or smaller" };
  }

  return {
    latitude,
    longitude,
    severity,
    description: description || null,
    photoValue,
  };
}

export async function submitDemoReport(user: AuthenticatedUser, formData: FormData) {
  const validated = validateReportSubmission(formData);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const report = await createDemoReport({
    citizenId: user.userId,
    latitude: validated.latitude,
    longitude: validated.longitude,
    severity: validated.severity,
    description: validated.description,
    photoBytes: new Uint8Array(await validated.photoValue.arrayBuffer()),
    mimeType: validated.photoValue.type,
  });

  return NextResponse.json({
    success: true,
    reportId: report.reportId,
    potholeId: report.potholePublicId,
    status: report.status,
  });
}

export async function listDemoReports(user: AuthenticatedUser) {
  const profile = await findDemoUserById(user.userId);
  const reports = (await listDemoReportsForUser(user.userId)).map((report) => ({
    reportId: report.reportId,
    potholePublicId: report.potholePublicId,
    latitude: report.latitude,
    longitude: report.longitude,
    severity: report.severity,
    status: report.status,
    submittedAt: report.submittedAt,
    photoUrl: demoReportPhotoUrl(report),
  }));

  return NextResponse.json({
    user: { name: profile?.name || "Citizen" },
    reports,
  });
}

export async function getDemoPublicImpactResponse() {
  return NextResponse.json(await getDemoPublicImpact());
}

export function hasOracleConfig(): boolean {
  return Boolean(
    process.env.ORACLE_USER?.trim()
    && process.env.ORACLE_PASSWORD?.trim()
    && process.env.ORACLE_CONNECT_STRING?.trim(),
  );
}
