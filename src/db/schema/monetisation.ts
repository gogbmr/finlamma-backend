import { jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { users } from "./users";

// docs/ARCHITECTURE.md D10: ad-free status via a RevenueCat webhook.
// Razorpay is in the enum because D10 names it as a future second source,
// but has no implementation in v1 (docs/PRODUCT_SPEC.md's Monetisation
// section - "out of scope for v1").
export const entitlementSourceEnum = pgEnum("entitlement_source", ["revenuecat", "razorpay"]);

// One value today - kept as an enum (not a plain boolean column) so a
// future entitlement type is an enum addition, not a schema redesign. Same
// "enum with one value for now" reasoning as compliance.ts's
// consentMethodEnum.
export const entitlementKeyEnum = pgEnum("entitlement_key", ["ad_free"]);

// Current-state row per (user, entitlement) - upserted in place by the
// RevenueCat webhook (src/server/monetisation/service.ts), never a history
// table; the webhook payload itself is the history, kept in `raw` only for
// the entitlement's last-applied change (debugging/reconciliation - never
// served back to the app).
export const entitlements = pgTable(
  "entitlements",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entitlement: entitlementKeyEnum("entitlement").notNull(),
    source: entitlementSourceEnum("source").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
  },
  (t) => [uniqueIndex("entitlements_user_id_entitlement_idx").on(t.userId, t.entitlement)],
).enableRLS();

// Webhook delivery dedupe. RevenueCat makes no ordering or single-delivery
// guarantee (unlike Clerk/svix, which this codebase already handles via a
// clerkUpdatedAt staleness check on the target row itself) - there's no
// equivalent staleness field on `entitlements` to lean on, so the event id
// itself is the dedupe key. Scoped by `source` so any future webhook can
// reuse this same table rather than inventing its own replay guard.
export const webhookEventSourceEnum = pgEnum("webhook_event_source", ["revenuecat"]);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    ...idAndTimestamps(),
    source: webhookEventSourceEnum("source").notNull(),
    eventId: text("event_id").notNull(),
  },
  (t) => [uniqueIndex("webhook_events_source_event_id_idx").on(t.source, t.eventId)],
).enableRLS();
