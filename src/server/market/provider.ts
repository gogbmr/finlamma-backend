import { env } from "@/lib/env";
import { MockMarketDataProvider } from "./providers/mock";
import { TwelveDataProvider } from "./providers/twelvedata";
import type { MarketDataProvider } from "./types";

export type MarketDataProviderKind = "twelvedata" | "mock";

// D38/D39 (docs/ARCHITECTURE.md): resolves which provider is actually in
// effect right now, without instantiating one - shared by
// getMarketDataProvider() below and GET /api/v1/health's market status
// field, so the two can never disagree about what's configured.
//
// Resolution order: an explicit MARKET_DATA_PROVIDER override always wins
// (lets local dev force "mock" even with a real key present, for
// deterministic testing, or force "twelvedata" to fail loudly on a missing
// key rather than silently using mock data); otherwise auto-selects
// "twelvedata" when TWELVEDATA_API_KEY is set, "mock" when it isn't - so a
// fresh clone with no market-data key configured just works locally with
// zero setup, per the founder's request to build/test the whole trading
// flow before paying for a vendor.
export function getMarketDataProviderKind(): MarketDataProviderKind {
  if (env.MARKET_DATA_PROVIDER) return env.MARKET_DATA_PROVIDER;
  return env.TWELVEDATA_API_KEY ? "twelvedata" : "mock";
}

// D38 (docs/ARCHITECTURE.md): the ONLY place a concrete vendor is chosen.
// Every other file in this domain (and every route handler) calls
// getMarketDataProvider(), never `new TwelveDataProvider()`/
// `new MockMarketDataProvider()` directly - a future vendor swap (e.g. to
// an Indian broker API, see D38/D39) is a one-line change here plus a new
// file under providers/, not a search-and-replace across the trading
// domain. Not cached in a module-level singleton on purpose - neither
// provider holds state (TwelveDataProvider reads env.TWELVEDATA_API_KEY per
// call, MockMarketDataProvider is pure), so there's nothing to gain from
// reusing one instance, and this keeps swapping trivial to test.
export function getMarketDataProvider(): MarketDataProvider {
  return getMarketDataProviderKind() === "mock" ? new MockMarketDataProvider() : new TwelveDataProvider();
}
