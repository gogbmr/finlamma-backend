import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { getOrSetJsonCache } from "@/lib/redis";
import { AppError } from "./errors";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60; // 6h - covers a full lesson/video session

// Shorter than DEFAULT_SIGNED_URL_TTL_SECONDS on purpose (founder decision,
// 2026-11-27) - a cache entry always has real URL validity left when it's
// hit, and the cache itself expires (forcing a fresh sign) before the URL
// it served would have expired anyway, so a client can never be handed an
// already-expired cached URL.
const SIGNED_URL_CACHE_TTL_SECONDS = 5 * 60 * 60; // 5h

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

// Founder decision (2026-11-27): a Redis-cached variant of
// getSignedDownloadUrl, for callers whose URL is fetched repeatedly for
// the same key and handed to a client that caches images by URL string
// (worlds.artUrl/cardMediaUrl - every plain getSignedDownloadUrl call
// signs fresh, so the URL's query string differs on every single request
// even for the same key, which defeats any URL-keyed image cache on the
// client). Deliberately a SEPARATE function, not a change to
// getSignedDownloadUrl itself - every other existing caller (badges,
// certificates, mentors, staff) keeps signing fresh every time, unchanged,
// since this wasn't asked for there and a stale-for-up-to-5h URL isn't
// obviously the right tradeoff for all of them. Fails open exactly like
// getOrSetJsonCache already does elsewhere in this codebase (market
// quote/candle caching) - Redis unconfigured or unreachable just means a
// fresh sign on every call, same as today, never a failed request.
export async function getCachedSignedDownloadUrl(
  key: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  return getOrSetJsonCache(
    `s3:signed-url:${key}`,
    SIGNED_URL_CACHE_TTL_SECONDS,
    () => getSignedDownloadUrl(key, expiresInSeconds),
  );
}
