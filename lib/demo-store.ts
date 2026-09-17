import { createHash } from "crypto";

type DemoUser = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
};

export type DemoReport = {
  reportId: string;
  potholePublicId: string;
  citizenId: string;
  latitude: number;
  longitude: number;
  severity: string;
  status: string;
  description: string | null;
  submittedAt: string;
  photoId: string;
};

type DemoPhoto = {
  citizenId: string;
  bytes: Uint8Array;
  mimeType: string;
};

const users = new Map<string, DemoUser>();
const reports: DemoReport[] = [];
const photos = new Map<string, DemoPhoto>();
let reportSequence = 0;
let potholeSequence = 0;
let photoSequence = 0;

function demoUserId(phone: string): string {
  return createHash("sha256").update(phone).digest("hex").slice(0, 12);
}

export function findDemoUser(phone: string): DemoUser | undefined {
  return users.get(phone);
}

export function upsertDemoUser(
  phone: string,
  name: string,
  email: string | null,
): DemoUser {
  const existing = users.get(phone);

  if (existing) {
    const updated = {
      ...existing,
      name,
      email,
    };
    users.set(phone, updated);
    return updated;
  }

  const created: DemoUser = {
    id: demoUserId(phone),
    name,
    phone,
    email,
    role: "citizen",
  };
  users.set(phone, created);
  return created;
}

export function getOrCreateDemoUser(
  phone: string,
  name: string,
  email: string | null,
): DemoUser {
  const existing = users.get(phone);
  if (existing) {
    return existing;
  }

  return upsertDemoUser(phone, name, email);
}

export function findDemoUserById(userId: string): DemoUser | undefined {
  for (const user of users.values()) {
    if (user.id === userId) {
      return user;
    }
  }
  return undefined;
}

export function createDemoReport(input: {
  citizenId: string;
  latitude: number;
  longitude: number;
  severity: string;
  description: string | null;
  photoBytes: Uint8Array;
  mimeType: string;
}): DemoReport {
  reportSequence += 1;
  potholeSequence += 1;
  photoSequence += 1;

  const reportId = `MIR-RPT-${String(reportSequence).padStart(8, "0")}`;
  const potholePublicId = `MIR-POT-${String(potholeSequence).padStart(8, "0")}`;
  const photoId = String(photoSequence);

  const report: DemoReport = {
    reportId,
    potholePublicId,
    citizenId: input.citizenId,
    latitude: input.latitude,
    longitude: input.longitude,
    severity: input.severity,
    status: "reported",
    description: input.description,
    submittedAt: new Date().toISOString(),
    photoId,
  };

  photos.set(photoId, {
    citizenId: input.citizenId,
    bytes: input.photoBytes,
    mimeType: input.mimeType,
  });
  reports.unshift(report);
  return report;
}

export function listDemoReportsForUser(citizenId: string): DemoReport[] {
  return reports.filter((report) => report.citizenId === citizenId);
}

export function getDemoPhoto(photoId: string, citizenId: string): DemoPhoto | undefined {
  const photo = photos.get(photoId);
  if (!photo || photo.citizenId !== citizenId) {
    return undefined;
  }
  return photo;
}

export function getDemoPublicImpact() {
  const issues = reports.map((report) => ({
    id: report.potholePublicId,
    latitude: report.latitude,
    longitude: report.longitude,
    severity: report.severity as "low" | "medium" | "high" | "critical",
    status: report.status,
  }));

  const underReview = reports.filter((report) =>
    ["reported", "verified", "assigned", "submitted", "under_verification"].includes(report.status),
  ).length;
  const inProgress = reports.filter((report) =>
    ["in_progress", "reopened", "escalated"].includes(report.status),
  ).length;
  const repaired = reports.filter((report) =>
    ["repaired", "closed"].includes(report.status),
  ).length;

  return {
    totalReports: reports.length,
    underReview,
    inProgress,
    repaired,
    issues,
  };
}

export function demoReportPhotoUrl(report: DemoReport): string {
  return `/api/report-photos/${report.photoId}`;
}

