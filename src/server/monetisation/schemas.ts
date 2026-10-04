import { z } from "zod";

// Only the fields this codebase actually reads. RevenueCat's real payload
// carries many more (price, country_code, subscriber_attributes, ...) -
// .passthrough() keeps them on the parsed object anyway (stored verbatim in
// entitlements.raw for debugging/reconciliation), they're just not
// individually validated since nothing here uses them. Field reference:
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields.md
//
// `entitlement_ids` is absent on a few rare event shapes (e.g.
// TEMPORARY_ENTITLEMENT_GRANT, sent only during store downtime) - optional,
// treated as "not an entitlement event we recognize" when missing.
export const RevenueCatEventSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    app_user_id: z.string(),
    expiration_at_ms: z.number().nullable().optional(),
    entitlement_ids: z.array(z.string()).optional(),
  })
  .passthrough();

export const RevenueCatWebhookPayloadSchema = z.object({
  api_version: z.string().optional(),
  event: RevenueCatEventSchema,
});
export type RevenueCatWebhookPayload = z.infer<typeof RevenueCatWebhookPayloadSchema>;

// The one entitlement identifier this app has today (docs/ARCHITECTURE.md
// D10) - must match the identifier string configured in the RevenueCat
// dashboard exactly, which this codebase has no way to verify on its own.
export const ENTITLEMENT_KEYS = ["ad_free"] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];
