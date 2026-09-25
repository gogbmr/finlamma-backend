import type { Candle, MarketDataProvider, MarketTimeframe, Quote } from "../types";

// Deterministic, no live vendor call, no cost - lets the whole trading flow
// (Checkpoint 5+ orders/holdings) be built and tested end-to-end before the
// founder pays anyone for market data (Twelve Data's NSE tier is still
// unconfirmed cost-wise - see docs/ARCHITECTURE.md D38/D39). Selected by
// getMarketDataProvider() (../provider.ts) - see that file's comment for
// exactly when this is chosen over TwelveDataProvider.
//
// Deliberately NOT randomized and NOT time-varying: a fixed price per
// symbol, always the same for a given (symbol, exchange) pair, so a test
// that reads a quote twice a second apart (e.g. Checkpoint 5's buy-then-
// sell round-trip invariant) never sees the price move underneath it. A
// small, fixed spread around the base price (open/high/low/previousClose)
// makes the quote shape realistic without introducing any non-determinism.
//
// Base prices are the real NSE snapshot values already used in
// docs/ECONOMY.md's affordability simulation (STOCKS table, prototype
// baseline) - not arbitrary, so local testing still reasons about
// realistic order sizes/costs.
const BASE_PRICES_RUPEES: Record<string, number> = {
  ITC: 462.9,
  SBIN: 812.65,
  TATAMOTORS: 1042.75,
  ICICIBANK: 1248.3,
  HDFCBANK: 1667.45,
  BHARTIARTL: 1586.4,
  INFY: 1475.8,
  HINDUNILVR: 2398.2,
  RELIANCE: 2845.1,
  ASIANPAINT: 2914.3,
  LT: 3624.85,
  TCS: 3859.55,
};

// A simple, stable hash for symbols not in the table above (any future
// instrument added without updating this list) - deterministic per symbol,
// never random, so it's still safe for tests. Not meant to look like a
// real price, just a plausible-magnitude fallback so the mock never throws.
function fallbackBasePriceRupees(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash * 31 + symbol.charCodeAt(i)) % 100000;
  }
  return 100 + (hash % 4000); // ₹100-4099 range
}

function basePricePaise(symbol: string): number {
  const rupees = BASE_PRICES_RUPEES[symbol] ?? fallbackBasePriceRupees(symbol);
  return Math.round(rupees * 100);
}

const CANDLE_COUNT: Record<MarketTimeframe, number> = {
  "1D": 26,
  "1W": 35,
  "1M": 22,
  "3M": 65,
  "1Y": 52,
};

// Candle spacing in milliseconds per timeframe - matches roughly what a
// real vendor would return for each bucket (15min bars for 1D, daily bars
// for 1M/3M, weekly for 1Y, hourly for 1W), so a chart rendered against
// mock data spans a realistic-looking date range.
const CANDLE_STEP_MS: Record<MarketTimeframe, number> = {
  "1D": 15 * 60_000,
  "1W": 60 * 60_000,
  "1M": 24 * 60 * 60_000,
  "3M": 24 * 60 * 60_000,
  "1Y": 7 * 24 * 60 * 60_000,
};

export class MockMarketDataProvider implements MarketDataProvider {
  async getQuote(symbol: string, exchange: string): Promise<Quote | null> {
    const price = basePricePaise(symbol);
    // Fixed, deterministic spread - never randomized (see class comment).
    const open = Math.round(price * 0.997);
    const high = Math.round(price * 1.005);
    const low = Math.round(price * 0.993);
    const previousClose = Math.round(price * 0.9985);
    return {
      symbol,
      exchange,
      pricePaise: price,
      changePaise: price - previousClose,
      changePercent: Number((((price - previousClose) / previousClose) * 100).toFixed(2)),
      openPaise: open,
      highPaise: high,
      lowPaise: low,
      previousClosePaise: previousClose,
      volume: 1_000_000,
      asOf: new Date(),
    };
  }

  async getCandles(symbol: string, _exchange: string, timeframe: MarketTimeframe): Promise<Candle[]> {
    const price = basePricePaise(symbol);
    const count = CANDLE_COUNT[timeframe];
    const stepMs = CANDLE_STEP_MS[timeframe];
    const now = Date.now();

    // A small, deterministic oscillation (sine wave keyed on the candle
    // index, not the clock) so a chart isn't a flat line, while staying
    // exactly reproducible run to run.
    const candles: Candle[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const wave = Math.sin(i / 3) * 0.01; // +/-1%
      const close = Math.round(price * (1 + wave));
      const open = Math.round(price * (1 + Math.sin((i + 1) / 3) * 0.01));
      candles.push({
        timestamp: new Date(now - i * stepMs),
        openPaise: open,
        highPaise: Math.max(open, close) + Math.round(price * 0.002),
        lowPaise: Math.min(open, close) - Math.round(price * 0.002),
        closePaise: close,
        volume: 500_000 + i * 1000,
      });
    }
    return candles;
  }
}
