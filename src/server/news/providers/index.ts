import { AppError } from "@/lib/errors";
import { MockNewsProvider } from "./mock";

export type NewsProviderKind = "mock";

// D50 (docs/ARCHITECTURE.md): no real news vendor is licensed for our
// ingest -> LLM-rewrite -> commercial-display use case yet, so "mock" is
// the only provider that exists - unlike
// src/server/market/provider.ts's getMarketDataProviderKind(), there is no
// real-vendor branch to fall into here. Once a vendor confirms licensing in
// writing, add that provider's class alongside MockNewsProvider and extend
// this function the same way market/provider.ts resolves twelvedata vs.
// mock - a one-file change, not a search-and-replace across the news
// domain, since every caller goes through getNewsProvider(), never
// `new MockNewsProvider()` directly.
export function getNewsProviderKind(): NewsProviderKind {
  return "mock";
}

export function getNewsProvider(): MockNewsProvider {
  const kind = getNewsProviderKind();
  if (kind === "mock") return new MockNewsProvider();
  throw new AppError("SERVICE_UNAVAILABLE", `No news provider implemented for "${kind}"`);
}
