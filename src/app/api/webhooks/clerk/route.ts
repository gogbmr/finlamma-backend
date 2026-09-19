import { z } from "zod";
import { env } from "@/lib/env";
import { verifyClerkWebhook } from "@/lib/clerk-webhook";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { syncUserFromClerkEvent } from "@/server/users/service";

const WebhookResponseSchema = registry.register(
  "ClerkWebhookResponse",
  z.object({ data: z.object({ received: z.literal(true) }) }),
);

registry.registerPath({
  method: "post",
  path: "/api/webhooks/clerk",
  summary: "Clerk user webhook (consumer app)",
  description:
    "Called by Clerk (not the app or the mobile client) on user.created, user.updated and " +
    "user.deleted to keep our users table in sync. This is the CONSUMER Clerk application's " +
    "webhook (see docs/ARCHITECTURE.md decision D2a) - the STAFF app has its own separate " +
    "webhook at /api/webhooks/clerk-staff. Authenticated by an HMAC signature in the " +
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
  const evt = await verifyClerkWebhook(req, env.CLERK_WEBHOOK_SIGNING_SECRET);
  await syncUserFromClerkEvent(evt);
  return ok({ received: true as const });
});
