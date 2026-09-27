import { getOrSetJsonCache } from "@/lib/redis";
import { getMarketDataProvider } from "./provider";
import type { Candle, MarketTimeframe, Quote } from "./types";

// trading-rules skill: "Never call Twelve Data per user request without the
// cache." Quotes are cached briefly (well under the 60s PRICE_STALE window
// Checkpoint 5's execution price check uses, so this cache never becomes
// the reason a price looks stale) - short enough that the Trade tab still
// feels live, long enough that a busy screen doesn't burn a vendor credit
// per render.
const QUOTE_CACHE_TTL_SECONDS = 10;

// Longer-period candles don't meaningfully change within an hour; the 1D
// (intraday) timeframe still refreshes often enough to feel live without
// re-fetching on every request.
const CANDLE_CACHE_TTL_SECONDS: Record<MarketTimeframe, number> = {
  "1D": 60,
  "1W": 300,
  "1M": 3600,
  "3M": 3600,
  "1Y": 3600,
};

function quoteCacheKey(symbol: string, exchange: string): string {
  return `market:quote:${exchange}:${symbol}`;
}

function candleCacheKey(symbol: string, exchange: string, timeframe: MarketTimeframe): string {
  return `market:candles:${exchange}:${symbol}:${timeframe}`;
}

// Re-hydrates a Date field that may have come back as an ISO string from the
// JSON cache (a cache hit round-trips through JSON.stringify/parse, which
// turns a Date into a string) - `new Date(x)` is a correct no-op when `x`
// is already a Date instance (the cache-miss/fresh-fetch path), so this is
// safe to apply unconditionally rather than branching on cache hit/miss.
function rehydrateQuote(quote: Quote): Quote {
  return { ...quote, asOf: new Date(quote.asOf) };
}
function rehydrateCandle(candle: Candle): Candle {
  return { ...candle, timestamp: new Date(candle.timestamp) };
}

export async function getCachedQuote(symbol: string, exchange: string): Promise<Quote | null> {
  const result = await getOrSetJsonCache(quoteCacheKey(symbol, exchange), QUOTE_CACHE_TTL_SECONDS, () =>
    getMarketDataProvider().getQuote(symbol, exchange),
  );
  return result ? rehydrateQuote(result) : null;
}

export async function getCachedCandles(
  symbol: string,
  exchange: string,
  timeframe: MarketTimeframe,
): Promise<Candle[]> {
  const result = await getOrSetJsonCache(
    candleCacheKey(symbol, exchange, timeframe),
    CANDLE_CACHE_TTL_SECONDS[timeframe],
    () => getMarketDataProvider().getCandles(symbol, exchange, timeframe),
  );
  return result.map(rehydrateCandle);
}
