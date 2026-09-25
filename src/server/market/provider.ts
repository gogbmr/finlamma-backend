import { TwelveDataProvider } from "./providers/twelvedata";
import type { MarketDataProvider } from "./types";

// D38 (docs/ARCHITECTURE.md): the ONLY place a concrete vendor is chosen.
// Every other file in this domain (and every route handler) calls
// getMarketDataProvider(), never `new TwelveDataProvider()` directly - a
// future vendor swap (e.g. to an Indian broker API, see D38) is a one-line
// change here plus a new file under providers/, not a search-and-replace
// across the trading domain. Not cached in a module-level singleton on
// purpose - TwelveDataProvider itself holds no state (it reads
// env.TWELVEDATA_API_KEY per call), so there's nothing to gain from reusing
// one instance, and this keeps swapping trivial to test.
export function getMarketDataProvider(): MarketDataProvider {
  return new TwelveDataProvider();
}
