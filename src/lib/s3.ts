import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { AppError } from "./errors";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60; // 6h - covers a full lesson/video session

// Created lazily inside getS3Config() (not at module scope) so importing this
// file doesn't require S3_* to be configured yet - same lazy-fail-closed
// pattern as getResendConfig() in src/lib/email.ts. forcePathStyle is
// required for Supabase Storage's S3-compatible endpoint.
function getS3Config() {
  if (
    !env.S3_ENDPOINT ||
    !env.S3_REGION ||
    !env.S3_BUCKET ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY
  ) {
    return null;
  }
  return {
    client: new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    }),
    bucket: env.S3_BUCKET,
  };
}

// The bucket is private - nothing here is ever served from a public bucket
// URL. Every read goes through getSignedDownloadUrl(), so access is
// short-lived and revocable (stop minting new URLs, the old ones expire).
export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  const config = getS3Config();
  if (!config) {
    throw new AppError("SERVICE_UNAVAILABLE", "Storage is not configured");
  }

  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function deleteObject(key: string) {
  const config = getS3Config();
  if (!config) {
    throw new AppError("SERVICE_UNAVAILABLE", "Storage is not configured");
  }

  await config.client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}

export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
) {
  const config = getS3Config();
  if (!config) {
    throw new AppError("SERVICE_UNAVAILABLE", "Storage is not configured");
  }

  return presign(
    config.client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}
