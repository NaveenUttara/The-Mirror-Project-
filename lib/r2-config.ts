import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

let client: S3Client | undefined;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT?.trim()
    && process.env.R2_ACCESS_KEY_ID?.trim()
    && process.env.R2_SECRET_ACCESS_KEY?.trim()
    && process.env.R2_BUCKET_NAME?.trim(),
  );
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getR2Client(): S3Client {
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

export function getR2BucketName(): string {
  return requiredEnvironment("R2_BUCKET_NAME");
}

export async function readR2Object(key: string): Promise<Uint8Array | null> {
  if (!isR2Configured()) {
    return null;
  }

  try {
    const result = await getR2Client().send(new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
    }));
    if (!result.Body) {
      return null;
    }
    return result.Body.transformToByteArray();
  } catch (error) {
    if (error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound")) {
      return null;
    }
    throw error;
  }
}

export async function writeR2Object(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await getR2Client().send(new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: key,
    Body: bytes,
    ContentType: contentType,
  }));
}

export async function deleteR2Object(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({
    Bucket: getR2BucketName(),
    Key: key,
  }));
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
