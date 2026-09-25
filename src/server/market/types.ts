// D38 (docs/ARCHITECTURE.md): every shape in this file is OUR OWN, vendor-
// neutral representation - never a Twelve Data (or any other vendor's) raw
// response type. `src/server/market/providers/*` are the only files allowed
// to know a specific vendor's field names/units; everything else in this
// domain (Redis caching, route handlers, response schemas) only ever sees
// these types. This is what keeps a future vendor swap (e.g. to an Indian
// broker API, if Twelve Data's NSE tier turns out too expensive) a
// contained change to one adapter file, not a rewrite of the trading domain.

// Our own timeframe vocabulary (matches TR-05's chart timeframe chips,
// docs/FEATURE_MAP.md) - deliberately NOT the vendor's own interval/
// outputsize query-param values, which differ between vendors. Each
// provider's candle method translates one of these into whatever its own
// API actually needs.
export const MARKET_TIMEFRAMES = ["1D", "1W", "1M", "3M", "1Y"] as const;
export type MarketTimeframe = (typeof MARKET_TIMEFRAMES)[number];

// A live (or last-known) quote, fully normalized: all money fields in
// paise (CLAUDE.md rule 2), never the vendor's decimal-rupee strings.
export type Quote = {
  symbol: string;
  exchange: string;
  pricePaise: number;
  changePaise: number;
  changePercent: number;
  openPaise: number;
  highPaise: number;
  lowPaise: number;
  previousClosePaise: number;
  volume: number;
  // When the underlying vendor captured this quote - never "now", since a
  // stale/delayed quote must be identifiable as such by the caller (see
  // trading-rules skill's PRICE_STALE check, Checkpoint 5).
  asOf: Date;
};

export type Candle = {
  timestamp: Date;
  openPaise: number;
  highPaise: number;
  lowPaise: number;
  closePaise: number;
  volume: number;
};

// The one seam every market-data vendor integration implements. Route
// handlers and services never call a vendor's SDK/fetch directly - always
// through this interface, via getMarketDataProvider() (provider.ts).
export interface MarketDataProvider {
  // Returns null (not a thrown error) if the vendor has no data for this
  // symbol/exchange right now - callers decide how to surface that
  // (PRICE_UNAVAILABLE, per the founder's decision on the trading-rules
  // skill), rather than every provider inventing its own error shape.
  getQuote(symbol: string, exchange: string): Promise<Quote | null>;
  getCandles(
    symbol: string,
    exchange: string,
    timeframe: MarketTimeframe,
  ): Promise<Candle[]>;
}
