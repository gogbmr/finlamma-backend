import type { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { AppError } from "./errors";

// Shared by both Clerk webhook endpoints (consumer app:
// src/app/api/webhooks/clerk/route.ts, staff app: src/app/api/webhooks/
// clerk-staff/route.ts) - the HMAC verification is identical, only the
// signing secret and what happens with the verified event differ.
export async function verifyClerkWebhook(
  req: Request,
  signingSecret: string | undefined,
): Promise<WebhookEvent> {
  if (!signingSecret) {
    // Fail closed: without a secret we cannot verify authenticity, so we
    // must not process the event. This lets a route be deployed before it's
    // registered in the Clerk dashboard (which needs the deployed URL
    // first) without ever accepting unverified webhook calls.
    throw new AppError("SERVICE_UNAVAILABLE", "Webhook signing secret not configured");
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new AppError("INVALID_SIGNATURE", "Missing svix headers");
  }

  // Signature verification needs the exact raw bytes Clerk signed - read
  // the body as text, never req.json(), which would re-serialize it.
  const body = await req.text();

  try {
    // `new Webhook(secret)` itself throws synchronously if the secret is
    // empty, the wrong type, or not valid base64 (e.g. a malformed value
    // pasted into the hosting provider's env vars) - it must be inside this
    // try too, not just .verify(), otherwise a bad secret in production
    // becomes an uncaught 500 instead of a clear 400.
    const wh = new Webhook(signingSecret);
    // svix@2.5.0's Webhook.verify() ONLY validates the signature (it throws
    // on failure) - it never returns the parsed payload. Its compiled
    // source (node_modules/svix/dist/index.mjs) discards the inner
    // verifier's return value and always forces { jsonParse: false }
    // regardless of what's asked for, so `wh.verify(...)` is always
    // undefined on success. A prior version of this code wrongly assumed
    // otherwise (only ever exercised through a test mock that didn't match
    // this), which crashed every real webhook delivery with "Cannot read
    // properties of undefined (reading 'type')". Parse the already-verified
    // raw body ourselves instead.
    wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
    return JSON.parse(body) as WebhookEvent;
  } catch {
    // Deliberately don't log the caught error: svix's own error messages
    // are generic (e.g. "Secret can't be empty."), but the underlying
    // base64 decoder is third-party code we don't control, and this path
    // runs on every input that touches a webhook signing secret, so we
    // never take the risk of a future dependency change echoing it into logs.
    console.error("Clerk webhook signature verification failed");
    throw new AppError("INVALID_SIGNATURE", "Invalid webhook signature");
  }
}
