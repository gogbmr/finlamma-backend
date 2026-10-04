import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "./errors";

// RevenueCat retries a delivery with a freshly-computed signature (new
// timestamp each attempt) - see
// https://www.revenuecat.com/docs/integrations/webhooks#signature-timestamp-on-retries
// - so this tolerance is "how old can ONE delivery attempt's timestamp be",
// not anything about retries specifically.
const SIGNATURE_TOLERANCE_SECONDS = 300;

// HMAC verification for RevenueCat's webhook (dashboard > Integrations >
// Webhooks > this endpoint > signing secret), mirroring verifyClerkWebhook's
// fail-closed shape (src/lib/clerk-webhook.ts) - RevenueCat also offers a
// weaker plain shared-secret header option, deliberately not used here, same
// "verify a signature, don't just compare a static string" bar every other
// webhook in this codebase meets.
export async function verifyRevenueCatWebhook(
  req: Request,
  signingSecret: string | undefined,
): Promise<unknown> {
  if (!signingSecret) {
    throw new AppError("SERVICE_UNAVAILABLE", "RevenueCat webhook signing secret not configured");
  }

  const signatureHeader = req.headers.get("x-revenuecat-webhook-signature");
  if (!signatureHeader) {
    throw new AppError("INVALID_SIGNATURE", "Missing X-RevenueCat-Webhook-Signature header");
  }

  // Header shape: "t=<unix_timestamp>,v1=<hmac_sha256_hex>".
  const parts = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value] as [string, string | undefined];
    }),
  );
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) {
    throw new AppError("INVALID_SIGNATURE", "Malformed signature header");
  }

  // Needs the exact raw bytes RevenueCat signed - read as text, never
  // req.json(), which would re-serialize it and change the bytes (same
  // reasoning as Clerk's webhook verifier).
  const body = await req.text();

  const expectedSignature = createHmac("sha256", signingSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const signatureValid =
    signatureBuffer.length === expectedBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!signatureValid) {
    // Deliberately don't log the header/signature values themselves - same
    // "don't echo anything touching a webhook secret" reasoning as the
    // Clerk webhook verifier.
    console.error("RevenueCat webhook signature verification failed");
    throw new AppError("INVALID_SIGNATURE", "Invalid webhook signature");
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    throw new AppError("INVALID_SIGNATURE", "Webhook timestamp outside tolerance");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new AppError("VALIDATION_FAILED", "Malformed webhook payload");
  }
}
