import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { readFile } from "fs/promises";
import path from "path";

let client: S3Client | undefined;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function r2Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: requiredEnvironment("R2_ENDPOINT"),
      credentials: {
        accessKeyId: requiredEnvironment("R2_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnvironment("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  return client;
}

function bucketName(): string {
  return requiredEnvironment("R2_BUCKET_NAME");
}

export async function saveReportPhoto(
  objectKey: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  await r2Client().send(new PutObjectCommand({
    Bucket: bucketName(),
    Key: objectKey,
    Body: bytes,
    ContentType: mimeType,
  }));
}

export async function deleteReportPhoto(objectKey: string): Promise<void> {
  await r2Client().send(new DeleteObjectCommand({
    Bucket: bucketName(),
    Key: objectKey,
  }));
}

export async function loadReportPhoto(objectKey: string): Promise<Uint8Array> {
  const result = await r2Client().send(new GetObjectCommand({
    Bucket: bucketName(),
    Key: objectKey,
  }));

  if (!result.Body) {
    throw new Error("PHOTO_OBJECT_EMPTY");
  }

  return result.Body.transformToByteArray();
}

export async function loadLegacyLocalReportPhoto(objectKey: string): Promise<Uint8Array> {
  const root = path.join(process.cwd(), "storage");
  const absolutePhotoPath = path.resolve(root, objectKey);
  const relativePhotoPath = path.relative(root, absolutePhotoPath);

  if (relativePhotoPath.startsWith("..") || path.isAbsolute(relativePhotoPath)) {
    throw new Error("INVALID_PHOTO_PATH");
  }

  return new Uint8Array(await readFile(absolutePhotoPath));
}

export function isMissingR2Object(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const metadata = "$metadata" in error
    ? (error as Error & { $metadata?: { httpStatusCode?: number } }).$metadata
    : undefined;

  return error.name === "NoSuchKey"
    || error.name === "NotFound"
    || metadata?.httpStatusCode === 404;
}
