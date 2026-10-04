import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "./errors";

// RevenueCat retries a delivery with a freshly-computed signature (new
// timestamp each attempt) - see
// https://www.revenuecat.com/docs/integrations/webhooks#signature-timestamp-on-retries
// - so this tolerance is "how old can ONE delivery attempt's timestamp be",
// not anything about retries specifically.
const SIGNATURE_TOLERANCE_SECONDS = 300;

export type RevenueCatWebhookSecrets = {
  // Dashboard > Integrations > Webhooks > this endpoint > "enable HMAC
  // signing" (an explicit opt-in per RevenueCat's own docs - NOT what their
  // basic "Registering Your Webhook URL" setup page describes by default).
  hmacSigningSecret: string | undefined;
  // Dashboard > Integrations > Webhooks > this endpoint > "Authorization
  // header value" - the plain shared-secret mechanism RevenueCat's basic
  // setup doc actually walks through first, sent as a literal
  // `Authorization` header on every delivery.
  authHeaderValue: string | undefined;
};

// Verifies a RevenueCat webhook delivery. RevenueCat supports two
// DIFFERENT, independently-configured authentication mechanisms for the
// same webhook endpoint (see https://www.revenuecat.com/docs/integrations/webhooks.md
// - "Registering Your Webhook URL" describes the plain Authorization-header
// value as the mechanism you set up by default; "Security and Best
// Practices > Webhook Signature Verification (HMAC)" describes HMAC
// signing as a separate, opt-in "for stronger verification" toggle on the
// SAME integration) - which one a real deployment actually uses depends on
// a dashboard choice made when the webhook is registered, not on anything
// this codebase controls. Rather than guess which one and find out wrong
// against a live account, this checks whichever header the request
// actually carries against whichever secret is actually configured for
// that mechanism - either one working is sufficient, and if a secret for
// the header that arrived was never configured, that's an unverified
// request, not a pass.
export async function verifyRevenueCatWebhook(
  req: Request,
  secrets: RevenueCatWebhookSecrets,
): Promise<unknown> {
  if (!secrets.hmacSigningSecret && !secrets.authHeaderValue) {
    throw new AppError("SERVICE_UNAVAILABLE", "RevenueCat webhook secret not configured");
  }

  const signatureHeader = req.headers.get("x-revenuecat-webhook-signature");
  const authHeader = req.headers.get("authorization");

  if (signatureHeader && secrets.hmacSigningSecret) {
    return verifyHmacSignature(req, signatureHeader, secrets.hmacSigningSecret);
  }
  if (authHeader !== null && secrets.authHeaderValue) {
    return verifySharedAuthHeader(req, authHeader, secrets.authHeaderValue);
  }

  // Either no recognized auth header arrived at all, or the one that did
  // arrive has no matching secret configured on our side - e.g. the
  // dashboard was set up with the plain auth-header mechanism but only
  // REVENUECAT_WEBHOOK_SECRET (the HMAC secret) was ever set here. Fails
  // closed and visibly (this throws INVALID_SIGNATURE, which RevenueCat's
  // own delivery dashboard shows as a failed attempt immediately on the
  // very first test send) rather than silently accepting an unverified
  // payload.
  throw new AppError("INVALID_SIGNATURE", "Missing or unconfigured webhook authentication");
}

async function verifyHmacSignature(
  req: Request,
  signatureHeader: string,
  signingSecret: string,
): Promise<unknown> {
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
    console.error("RevenueCat webhook HMAC signature verification failed");
    throw new AppError("INVALID_SIGNATURE", "Invalid webhook signature");
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    throw new AppError("INVALID_SIGNATURE", "Webhook timestamp outside tolerance");
  }

  return parseJsonBody(body);
}

async function verifySharedAuthHeader(
  req: Request,
  authHeader: string,
  expectedValue: string,
): Promise<unknown> {
  const providedBuffer = Buffer.from(authHeader);
  const expectedBuffer = Buffer.from(expectedValue);
  const valid =
    providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);

  if (!valid) {
    console.error("RevenueCat webhook Authorization header verification failed");
    throw new AppError("INVALID_SIGNATURE", "Invalid webhook authorization header");
  }

  const body = await req.text();
  return parseJsonBody(body);
}

function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new AppError("VALIDATION_FAILED", "Malformed webhook payload");
  }
}
