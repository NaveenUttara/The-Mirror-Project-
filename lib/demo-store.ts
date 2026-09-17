import { createHash } from "crypto";
import type { DemoReport, DemoUserRecord } from "@/lib/demo-persistence";
import {
  demoPhotoStorageKey,
  loadDemoPhoto,
  loadDemoSnapshot,
  saveDemoPhoto,
  saveDemoSnapshot,
  type DemoPhotoRecord,
  type DemoSnapshot,
} from "@/lib/demo-persistence";

export type { DemoReport, DemoUserRecord };

type DemoGlobal = typeof globalThis & {
  demoStoreSnapshot?: DemoSnapshot;
  demoStoreLoadPromise?: Promise<void>;
};

const demoGlobal = globalThis as DemoGlobal;

function demoUserId(phone: string): string {
  return createHash("sha256").update(phone).digest("hex").slice(0, 12);
}

function snapshot(): DemoSnapshot {
  if (!demoGlobal.demoStoreSnapshot) {
    demoGlobal.demoStoreSnapshot = {
      version: 1,
      users: [],
      reports: [],
      sequences: {
        reportSequence: 0,
        potholeSequence: 0,
        photoSequence: 0,
      },
      photos: {},
    };
  }
  return demoGlobal.demoStoreSnapshot;
}

export async function ensureDemoStoreLoaded(): Promise<void> {
  if (demoGlobal.demoStoreSnapshot) {
    return;
  }

  if (!demoGlobal.demoStoreLoadPromise) {
    demoGlobal.demoStoreLoadPromise = loadDemoSnapshot().then((loaded) => {
      demoGlobal.demoStoreSnapshot = loaded;
    });
  }

  await demoGlobal.demoStoreLoadPromise;
}

async function persistDemoStore(): Promise<void> {
  await saveDemoSnapshot(snapshot());
}

function findUserByPhone(phone: string): DemoUserRecord | undefined {
  return snapshot().users.find((user) => user.phone === phone);
}

export async function findDemoUser(phone: string): Promise<DemoUserRecord | undefined> {
  await ensureDemoStoreLoaded();
  return findUserByPhone(phone);
}

export async function upsertDemoUser(
  phone: string,
  name: string,
  email: string | null,
): Promise<DemoUserRecord> {
  await ensureDemoStoreLoaded();
  const store = snapshot();
  const existing = findUserByPhone(phone);

  if (existing) {
    existing.name = name;
    existing.email = email;
    await persistDemoStore();
    return existing;
  }

  const created: DemoUserRecord = {
    id: demoUserId(phone),
    name,
    phone,
    email,
    role: "citizen",
  };
  store.users.push(created);
  await persistDemoStore();
  return created;
}

export async function getOrCreateDemoUser(
  phone: string,
  name: string,
  email: string | null,
): Promise<DemoUserRecord> {
  await ensureDemoStoreLoaded();
  return findUserByPhone(phone) || upsertDemoUser(phone, name, email);
}

export async function findDemoUserById(userId: string): Promise<DemoUserRecord | undefined> {
  await ensureDemoStoreLoaded();
  return snapshot().users.find((user) => user.id === userId);
}

export async function createDemoReport(input: {
  citizenId: string;
  latitude: number;
  longitude: number;
  severity: string;
  description: string | null;
  photoBytes: Uint8Array;
  mimeType: string;
}): Promise<DemoReport> {
  await ensureDemoStoreLoaded();
  const store = snapshot();

  store.sequences.reportSequence += 1;
  store.sequences.potholeSequence += 1;
  store.sequences.photoSequence += 1;

  const reportId = `MIR-RPT-${String(store.sequences.reportSequence).padStart(8, "0")}`;
  const potholePublicId = `MIR-POT-${String(store.sequences.potholeSequence).padStart(8, "0")}`;
  const photoId = String(store.sequences.photoSequence);
  const storageKey = demoPhotoStorageKey(photoId, input.mimeType);

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

  store.photos[photoId] = {
    citizenId: input.citizenId,
    mimeType: input.mimeType,
    storageKey,
  };
  store.reports.unshift(report);

  await saveDemoPhoto(storageKey, input.photoBytes, input.mimeType);
  await persistDemoStore();
  return report;
}

export async function listDemoReportsForUser(citizenId: string): Promise<DemoReport[]> {
  await ensureDemoStoreLoaded();
  return snapshot().reports.filter((report) => report.citizenId === citizenId);
}

export async function getDemoPhoto(
  photoId: string,
  citizenId: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | undefined> {
  await ensureDemoStoreLoaded();
  const photo = snapshot().photos[photoId] as DemoPhotoRecord | undefined;
  if (!photo || photo.citizenId !== citizenId) {
    return undefined;
  }

  const bytes = await loadDemoPhoto(photo.storageKey);
  if (!bytes) {
    return undefined;
  }

  return { bytes, mimeType: photo.mimeType };
}

export async function getDemoPublicImpact() {
  await ensureDemoStoreLoaded();
  const reports = snapshot().reports;

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
