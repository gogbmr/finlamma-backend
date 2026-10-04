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
    "our `entitlements` table in sync (docs/ARCHITECTURE.md decision D10). RevenueCat supports " +
    "two independently-configured auth mechanisms for the same webhook endpoint, and this route " +
    "accepts either: an HMAC signature in X-RevenueCat-Webhook-Signature (verified against " +
    "REVENUECAT_WEBHOOK_SECRET - an explicit 'enable HMAC signing' opt-in in the dashboard), or " +
    "a plain shared value in the Authorization header (verified against " +
    "REVENUECAT_WEBHOOK_AUTH_HEADER - what RevenueCat's basic webhook setup configures by " +
    "default). Configured in the RevenueCat dashboard, not by a user or staff session.",
  tags: ["Webhooks"],
  request: {
    headers: z.object({
      "x-revenuecat-webhook-signature": z
        .string()
        .optional()
        .openapi({ description: "HMAC path: t=<unix_timestamp>,v1=<hmac_sha256_hex>" }),
      authorization: z
        .string()
        .optional()
        .openapi({ description: "Shared-header path: the plain configured auth header value" }),
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
              event_timestamp_ms: z
                .number()
                .optional()
                .openapi({ description: "Backs the out-of-order-delivery guard" }),
              expiration_at_ms: z.number().nullable().optional(),
              entitlement_ids: z.array(z.string()).optional().openapi({ example: ["ad_free"] }),
              store: z.string().optional().openapi({ example: "APP_STORE" }),
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
      description: "Neither webhook secret is configured",
      content: { "application/json": { schema: ErrorResponseSchema } },
    },
  },
});

export const POST = withErrors(async (req: Request) => {
  const payload = await verifyRevenueCatWebhook(req, {
    hmacSigningSecret: env.REVENUECAT_WEBHOOK_SECRET,
    authHeaderValue: env.REVENUECAT_WEBHOOK_AUTH_HEADER,
  });
  await processRevenueCatWebhookEvent(payload);
  return ok({ received: true as const });
});
