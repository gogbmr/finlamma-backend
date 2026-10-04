import type { RevenueCatProvider, RevenueCatSubscriberEntitlement } from "../types";

// Zero-setup default (no RevenueCat account needed to build/test the
// reconciliation job) - same "build the real integration point now, defer
// the real vendor account" reasoning D38/D39/D65 already established for
// Twelve Data and Expo push. Always reports no entitlements, deterministic
// and side-effect-free - a real deployment's reconciliation job only ever
// runs this way before REVENUECAT_SECRET_API_KEY is set, same lazy pattern
// as every other vendor integration in this codebase.
export class MockRevenueCatProvider implements RevenueCatProvider {
  async getSubscriberEntitlements(): Promise<RevenueCatSubscriberEntitlement[]> {
    return [];
  }
}
