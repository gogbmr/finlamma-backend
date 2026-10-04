import { z } from "zod";
import { env } from "@/lib/env";
import { ok, withErrors } from "@/lib/http";
import { ErrorResponseSchema, registry } from "@/lib/openapi";
import { verifyRevenueCatWebhook } from "@/lib/revenuecat-webhook";
import { processRevenueCatWebhookEvent } from "@/server/monetisation/service";

const WebhookResponseSchema = registry.register(
  "RevenueCatWebhookResponse",
  z.object({ data: z.object({ received: z.literal(true) }) }),
);

registry.registerPath({
  method: "post",
  path: "/api/webhooks/revenuecat",
  summary: "RevenueCat subscription webhook",
  description:
    "Called by RevenueCat (not the app or the mobile client) when a subscriber's entitlement " +
    "state changes (purchase, renewal, cancellation, expiration, billing issue, ...) - keeps " +
    "our `entitlements` table in sync (docs/ARCHITECTURE.md decision D10). Authenticated by an " +
    "HMAC signature in the X-RevenueCat-Webhook-Signature header, verified against " +
    "REVENUECAT_WEBHOOK_SECRET - configured as this endpoint's signing secret in the " +
    "RevenueCat dashboard, not by a user or staff session.",
  tags: ["Webhooks"],
  request: {
    headers: z.object({
      "x-revenuecat-webhook-signature": z
        .string()
        .openapi({ description: "t=<unix_timestamp>,v1=<hmac_sha256_hex>" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            api_version: z.string().optional(),
            event: z.object({
              id: z.string().openapi({ example: "12345678-1234-1234-1234-123456789012" }),
              type: z.string().openapi({ example: "RENEWAL" }),
              app_user_id: z.string().openapi({ description: "Our internal users.id" }),
              expiration_at_ms: z.number().nullable().optional(),
              entitlement_ids: z.array(z.string()).optional().openapi({ example: ["ad_free"] }),
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Event processed (or a type/entitlement we don't act on)",
      content: { "application/json": { schema: WebhookResponseSchema } },
    },
    400: {
      description: "Missing/invalid signature",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
    503: {
      description: "Webhook signing secret not configured",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const payload = await verifyRevenueCatWebhook(req, env.REVENUECAT_WEBHOOK_SECRET);
  await processRevenueCatWebhookEvent(payload);
  return ok({ received: true as const });
});
