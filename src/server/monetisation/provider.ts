import { env } from "@/lib/env";
import { MockRevenueCatProvider } from "./providers/mock";
import { RealRevenueCatProvider } from "./providers/revenuecat";
import type { RevenueCatProvider } from "./types";

export type RevenueCatProviderKind = "revenuecat" | "mock";

// Same D38/D39 pattern as src/server/market/provider.ts: auto-selects
// "mock" when REVENUECAT_SECRET_API_KEY isn't set, "revenuecat" when it is
// - so the reconciliation job works with zero vendor setup locally/in
// tests, and a real deployment just needs the one env var.
export function getRevenueCatProviderKind(): RevenueCatProviderKind {
  return env.REVENUECAT_SECRET_API_KEY ? "revenuecat" : "mock";
}

// The ONLY place a concrete RevenueCat REST client is chosen - the
// reconciliation job calls this, never `new RealRevenueCatProvider()`
// directly.
export function getRevenueCatProvider(): RevenueCatProvider {
  return getRevenueCatProviderKind() === "mock" ? new MockRevenueCatProvider() : new RealRevenueCatProvider();
}
