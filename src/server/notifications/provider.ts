import { env } from "@/lib/env";
import { ExpoPushProvider } from "./providers/expo";
import { MockPushProvider } from "./providers/mock";
import type { PushProvider } from "./types";

export type PushProviderKind = "expo" | "mock";

// Resolves which provider is actually in effect right now, without
// instantiating one - shared by getPushProvider() below and
// GET /api/v1/health's push status field, so the two can never disagree.
// Mirrors src/server/market/provider.ts's getMarketDataProviderKind exactly.
export function getPushProviderKind(): PushProviderKind {
  if (env.PUSH_PROVIDER) return env.PUSH_PROVIDER;
  return env.EXPO_ACCESS_TOKEN ? "expo" : "mock";
}

// The ONLY place a concrete push vendor is chosen. Every other file calls
// getPushProvider(), never `new ExpoPushProvider()`/`new MockPushProvider()`
// directly.
export function getPushProvider(): PushProvider {
  return getPushProviderKind() === "mock" ? new MockPushProvider() : new ExpoPushProvider();
}
