import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

try {
  const bucket = requiredEnvironment("R2_BUCKET_NAME");
  const client = new S3Client({
    region: "auto",
    endpoint: requiredEnvironment("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnvironment("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnvironment("R2_SECRET_ACCESS_KEY"),
    },
  });

  await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: "report-photos/",
    MaxKeys: 1,
  }));

  console.log("Cloudflare R2 authentication: SUCCESS");
  console.log("Private report-photo bucket: REACHABLE");
} catch (error) {
  console.error("Cloudflare R2 authentication: FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
