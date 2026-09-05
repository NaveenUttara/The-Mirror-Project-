import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { MedusaError } from "@medusajs/framework/utils"

let client: S3Client | undefined

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Missing required environment variable: ${name}`,
    )
  }
  return value
}

function r2Client(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: required("R2_ENDPOINT"),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  })
  return client
}

export async function putPhoto(key: string, body: Buffer, contentType: string) {
  await r2Client().send(new PutObjectCommand({
    Bucket: required("R2_BUCKET_NAME"),
    Key: key,
    Body: body,
    ContentType: contentType,
  }))
}

export async function getPhoto(key: string): Promise<Uint8Array> {
  const result = await r2Client().send(new GetObjectCommand({
    Bucket: required("R2_BUCKET_NAME"),
    Key: key,
  }))
  if (!result.Body) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "PHOTO_NOT_FOUND")
  }
  return result.Body.transformToByteArray()
}

export async function removePhoto(key: string) {
  await r2Client().send(new DeleteObjectCommand({
    Bucket: required("R2_BUCKET_NAME"),
    Key: key,
  }))
}
