import type { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { z } from "zod";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fail, ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { syncUserFromClerkEvent } from "@/server/users/service";

const WebhookResponseSchema = registry.register(
  "ClerkWebhookResponse",
  z.object({ data: z.object({ received: z.literal(true) }) }),
);

registry.registerPath({
  method: "post",
  path: "/api/webhooks/clerk",
  summary: "Clerk user webhook",
  description:
    "Called by Clerk (not the app or the mobile client) on user.created, user.updated and " +
    "user.deleted to keep our users table in sync. Authenticated by an HMAC signature in the " +
    "svix-id / svix-timestamp / svix-signature headers, verified against " +
    "CLERK_WEBHOOK_SIGNING_SECRET - configured as a webhook endpoint in the Clerk dashboard, " +
    "not by a user or staff session.",
  tags: ["Webhooks"],
  request: {
    headers: z.object({
      "svix-id": z.string().openapi({ description: "Unique id of this webhook delivery" }),
      "svix-timestamp": z.string().openapi({ description: "Unix timestamp the webhook was sent" }),
      "svix-signature": z.string().openapi({ description: "HMAC signature(s) of the request body" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            type: z.string().openapi({ example: "user.created" }),
            data: z.record(z.string(), z.unknown()),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Event processed (or a type we don't act on)",
      content: { "application/json": { schema: WebhookResponseSchema } },
    },
    400: {
      description: "Missing/invalid svix signature",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    503: {
      description: "Webhook signing secret not configured",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  if (!env.CLERK_WEBHOOK_SIGNING_SECRET) {
    // Fail closed: without a secret we cannot verify authenticity, so we
    // must not process the event. This lets us deploy the route before
    // it's registered in the Clerk dashboard (which needs the deployed
    // URL first) without ever accepting unverified webhook calls.
    return fail(
      new AppError("SERVICE_UNAVAILABLE", "Webhook signing secret not configured"),
    );
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return fail(new AppError("INVALID_SIGNATURE", "Missing svix headers"));
  }

  // Signature verification needs the exact raw bytes Clerk signed - read
  // the body as text, never req.json(), which would re-serialize it.
  const body = await req.text();

  let evt: WebhookEvent;
  try {
    // `new Webhook(secret)` itself throws synchronously if the secret is
    // empty, the wrong type, or not valid base64 (e.g. a malformed value
    // pasted into the hosting provider's env vars) - it must be inside this
    // try too, not just .verify(), otherwise a bad secret in production
    // becomes an uncaught 500 instead of a clear 400.
    const wh = new Webhook(env.CLERK_WEBHOOK_SIGNING_SECRET);
    // svix@2.5.0's types claim verify() returns undefined; it actually
    // returns the parsed, verified payload at runtime.
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as unknown as WebhookEvent;
  } catch {
    // Deliberately don't log the caught error: svix's own error messages
    // are generic (e.g. "Secret can't be empty."), but the underlying
    // base64 decoder is third-party code we don't control, and this path
    // runs on every input that touches CLERK_WEBHOOK_SIGNING_SECRET, so we
    // never take the risk of a future dependency change echoing the secret
    // into logs.
    console.error("Clerk webhook signature verification failed");
    return fail(new AppError("INVALID_SIGNATURE", "Invalid webhook signature"));
  }

  await syncUserFromClerkEvent(evt);

  return ok({ received: true as const });
});
