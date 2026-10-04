import { z } from "zod";
import { registry } from "@/lib/openapi";

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

// docs/ROADMAP.md Phase 8: "ad eligibility flag (World 3 completed and not
// ad-free)" - position-based, same reasoning as settings/schemas.ts's
// tradingUnlockAfterWorldPosition (src/server/worlds/service.ts's
// countLeadingClearedWorlds, shared by both gates) - keeps working
// automatically if worlds are added/removed/reordered ahead of it.
export const AdsSettingsSchema = z.object({
  adsEnabledAfterWorldPosition: z.number().int().positive(),
});
export type AdsSettings = z.infer<typeof AdsSettingsSchema>;
export const DEFAULT_ADS_SETTINGS: AdsSettings = { adsEnabledAfterWorldPosition: 3 };
export const ADS_SETTINGS_KEY = "ads_config";

export const MyEntitlementSchema = z.object({
  entitlement: z.enum(ENTITLEMENT_KEYS).openapi({ example: "ad_free" }),
  source: z.enum(["revenuecat", "razorpay"]).openapi({ example: "revenuecat" }),
  active: z
    .boolean()
    .openapi({ description: "true if expiresAt is null (never-expiring) or still in the future" }),
  expiresAt: z.string().nullable().openapi({ example: "2026-11-04T00:00:00.000Z" }),
});

export const MyEntitlementsResponseSchema = registry.register(
  "MyEntitlementsResponse",
  z.object({
    entitlements: z.array(MyEntitlementSchema),
    showAds: z
      .boolean()
      .openapi({ description: "Whether the client should mount/show ads right now" }),
    nonPersonalizedAdsRequired: z.boolean().openapi({
      description:
        "docs/ARCHITECTURE.md D66: true for an under-18 account, or one with no date of birth " +
        "on file (age unknown always fails closed to the strict treatment) - every ad request " +
        "must be tagged non-personalized/child-directed, never the permissive default.",
    }),
    canSubscribe: z.boolean().openapi({
      description:
        "docs/ARCHITECTURE.md D67: false for a known-or-unknown-age minor - the subscribe " +
        "purchase path must not be offered to this account at all; a parent must subscribe " +
        "from their own device/account.",
    }),
  }),
);
