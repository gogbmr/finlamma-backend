import type { EntitlementKey } from "./schemas";

// Vendor-neutral, our own shape - same reasoning as src/server/market/
// types.ts's D38 comment: this file is the only thing the reconciliation
// job (src/server/monetisation/service.ts) ever sees, never a RevenueCat
// REST response directly. `expiresAt: null` means never-expiring.
export type RevenueCatSubscriberEntitlement = {
  entitlement: EntitlementKey;
  expiresAt: Date | null;
};

// The one seam the reconciliation job calls through - never a vendor
// SDK/fetch call directly outside providers/revenuecat.ts.
export interface RevenueCatProvider {
  // RevenueCat's own canonical, right-now entitlement state for this
  // app_user_id (= our users.id) - independent of whatever our webhook-
  // derived `entitlements` table currently says. An entitlement this app
  // doesn't recognize (not in ENTITLEMENT_KEYS) is simply omitted, never
  // included with an unknown key.
  getSubscriberEntitlements(appUserId: string): Promise<RevenueCatSubscriberEntitlement[]>;
}
