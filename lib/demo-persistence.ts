import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { isR2Configured, readR2Object, writeR2Object } from "@/lib/r2-config";

const STORE_VERSION = 1;
const R2_STORE_KEY = "mirror-demo/store.json";
const LOCAL_STORE_DIR = path.join(process.cwd(), "storage", "demo");
const LOCAL_STORE_PATH = path.join(LOCAL_STORE_DIR, "store.json");
const LOCAL_PHOTO_DIR = path.join(LOCAL_STORE_DIR, "photos");

export type DemoUserRecord = {
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

export type DemoPhotoRecord = {
  citizenId: string;
  mimeType: string;
  storageKey: string;
};

export type DemoSnapshot = {
  version: number;
  users: DemoUserRecord[];
  reports: DemoReport[];
  sequences: {
    reportSequence: number;
    potholeSequence: number;
    photoSequence: number;
  };
  photos: Record<string, DemoPhotoRecord>;
};

export function emptyDemoSnapshot(): DemoSnapshot {
  return {
    version: STORE_VERSION,
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

function localPhotoPath(storageKey: string): string {
  const absolutePhotoPath = path.resolve(LOCAL_PHOTO_DIR, storageKey);
  const relativePhotoPath = path.relative(LOCAL_PHOTO_DIR, absolutePhotoPath);
  if (relativePhotoPath.startsWith("..") || path.isAbsolute(relativePhotoPath)) {
    throw new Error("INVALID_DEMO_PHOTO_PATH");
  }
  return absolutePhotoPath;
}

async function readLocalStore(): Promise<DemoSnapshot | null> {
  try {
    const raw = await readFile(LOCAL_STORE_PATH, "utf8");
    return JSON.parse(raw) as DemoSnapshot;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeLocalStore(snapshot: DemoSnapshot): Promise<void> {
  await mkdir(LOCAL_STORE_DIR, { recursive: true });
  await writeFile(LOCAL_STORE_PATH, JSON.stringify(snapshot, null, 2), "utf8");
}

export async function loadDemoSnapshot(): Promise<DemoSnapshot> {
  if (isR2Configured()) {
    const bytes = await readR2Object(R2_STORE_KEY);
    if (bytes) {
      return JSON.parse(Buffer.from(bytes).toString("utf8")) as DemoSnapshot;
    }
  }

  const localSnapshot = await readLocalStore();
  if (localSnapshot) {
    return localSnapshot;
  }

  return emptyDemoSnapshot();
}

export async function saveDemoSnapshot(snapshot: DemoSnapshot): Promise<void> {
  const payload = JSON.stringify(snapshot);

  if (isR2Configured()) {
    await writeR2Object(R2_STORE_KEY, new TextEncoder().encode(payload), "application/json");
  }

  try {
    await writeLocalStore(snapshot);
  } catch (error) {
    if (!isR2Configured()) {
      throw error;
    }
  }
}

export async function saveDemoPhoto(
  storageKey: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  if (isR2Configured()) {
    await writeR2Object(`mirror-demo/photos/${storageKey}`, bytes, mimeType);
  }

  try {
    const targetPath = localPhotoPath(storageKey);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);
  } catch (error) {
    if (!isR2Configured()) {
      throw error;
    }
  }
}

export async function loadDemoPhoto(storageKey: string): Promise<Uint8Array | null> {
  if (isR2Configured()) {
    const bytes = await readR2Object(`mirror-demo/photos/${storageKey}`);
    if (bytes) {
      return bytes;
    }
  }

  try {
    return new Uint8Array(await readFile(localPhotoPath(storageKey)));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function demoPhotoStorageKey(photoId: string, mimeType: string): string {
  const extension = mimeType === "image/png"
    ? ".png"
    : mimeType === "image/webp"
      ? ".webp"
      : ".jpg";
  return `${photoId}${extension}`;
}
