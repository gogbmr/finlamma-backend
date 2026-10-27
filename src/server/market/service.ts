import { AppError } from "@/lib/errors";
import {
  listMarketHolidays,
  getOrCreateMarketControls,
  listActiveInstruments,
  getInstrumentBySymbol,
} from "@/server/trading/repo";
import { getTradingUnlockProgress } from "@/server/worlds/service";
import { getCachedCandles, getCachedQuote } from "./cache";
import { isMarketOpen } from "./hours";
import { TRADING_DISCLAIMER, TRADING_DISCLAIMER_LOCALIZED } from "./schemas";
import type { MarketTimeframe, Quote } from "./types";

function shapeQuote(quote: Quote | null) {
  if (!quote) return null;
  return {
    pricePaise: quote.pricePaise,
    changePaise: quote.changePaise,
    changePercent: quote.changePercent,
    openPaise: quote.openPaise,
    highPaise: quote.highPaise,
    lowPaise: quote.lowPaise,
    previousClosePaise: quote.previousClosePaise,
    volume: quote.volume,
    asOf: quote.asOf.toISOString(),
  };
}

// TR-02/08 (Explore mode) - every active instrument with its live quote
// merged in. A quote fetch failing for one symbol never breaks the whole
// list (Promise.allSettled) - that symbol's `quote` is simply null, same as
// "vendor has no data right now".
export async function listPublicInstruments() {
  const instruments = await listActiveInstruments();
  // getCachedQuote/getCachedCandles are Redis-backed (falling back to the
  // market-data vendor's HTTP API on a miss), never Postgres directly.
  // promise-all-db-concurrency-ok: Redis/HTTP-backed, not a Postgres query
  const [quotes, candleSets] = await Promise.all([
    Promise.allSettled(instruments.map((i) => getCachedQuote(i.symbol, i.exchange))),
    // App asks batch, item A4: reuse the existing 1D candle cache for the
    // watchlist sparkline - no new provider call shape needed.
    Promise.allSettled(instruments.map((i) => getCachedCandles(i.symbol, i.exchange, "1D"))),
  ]);

  return {
    data: instruments.map((instrument, i) => {
      const quoteResult = quotes[i];
      const candleResult = candleSets[i];
      return {
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        name: instrument.name,
        sector: instrument.sector,
        tags: instrument.tags,
        lotSize: instrument.lotSize,
        halted: instrument.halted,
        quote: quoteResult?.status === "fulfilled" ? shapeQuote(quoteResult.value) : null,
        sparkline:
          candleResult?.status === "fulfilled" ? candleResult.value.map((c) => c.closePaise) : [],
      };
    }),
    disclaimer: TRADING_DISCLAIMER,
    disclaimerLocalized: TRADING_DISCLAIMER_LOCALIZED,
  };
}

// TR-15/17/19/20 - stock detail: instrument fields (including about/tip,
// D38-adjacent guardrail: src/server/trading/advice-language.ts warns staff
// authoring these, never the app) plus a live quote.
export async function getPublicInstrumentBySymbol(symbol: string) {
  const instrument = await getInstrumentBySymbol(symbol);
  if (!instrument || !instrument.active) {
    throw new AppError("NOT_FOUND", "No instrument with this symbol");
  }

  const quote = await getCachedQuote(instrument.symbol, instrument.exchange);

  return {
    data: {
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      name: instrument.name,
      sector: instrument.sector,
      tags: instrument.tags,
      lotSize: instrument.lotSize,
      halted: instrument.halted,
      about: instrument.about,
      tip: instrument.tip,
      mcap: instrument.mcap,
      pe: instrument.pe,
      quote: shapeQuote(quote),
    },
    disclaimer: TRADING_DISCLAIMER,
    disclaimerLocalized: TRADING_DISCLAIMER_LOCALIZED,
  };
}

// Phase 4 Trade asks (2026-10-20, item 5) - a server-controlled poll
// interval, so the app's refresh cadence can change (e.g. a slower poll
// during a feed pause) without an app release. Pure and deterministic:
// paused feed or a closed market have nothing moving, so there's no
// reason to poll fast; delayed_15m is already lagged by design, so
// polling it at live speed buys nothing.
export function computeRecommendedPollIntervalMs(
  marketOpen: boolean,
  feedMode: "live" | "delayed_15m" | "paused",
): number {
  if (feedMode === "paused" || !marketOpen) return 60_000;
  return feedMode === "live" ? 5_000 : 15_000;
}

// TR-01/34/57 - market-status pill, exchange-halted banner, order-pad
// lock/progress message, all from one call. `marketOpen` is computed from
// the server's own clock (never client-supplied, same reasoning as every
// other IST-sensitive check in this codebase - D30) and the admin-editable
// market_holidays calendar.
export async function getMarketStatus(userId: string) {
  const [holidays, controls, progress] = await Promise.all([
    listMarketHolidays(),
    getOrCreateMarketControls(),
    getTradingUnlockProgress(userId),
  ]);
  const holidayDates: Set<string> = new Set(holidays.map((h) => h.date));
  const marketOpen = isMarketOpen(new Date(), holidayDates);

  return {
    marketOpen,
    feedMode: controls.feedMode,
    globalHalt: controls.globalHalt,
    tradingUnlocked: progress.unlocked,
    worldsToGo: progress.worldsToGo,
    recommendedPollIntervalMs: computeRecommendedPollIntervalMs(marketOpen, controls.feedMode),
  };
}

// App asks batch, item A1 (TR-04): the fixed NIFTY 50 / BANK NIFTY / SENSEX
// index strip. No DB row per docs/DATA_MODEL.md - these reuse the exact same
// cached-quote path as every tradeable instrument, just with a code-defined
// symbol/exchange/name list instead of the `instruments` table. A symbol the
// vendor has no data for right now is simply omitted (never a synthetic
// value, same "no volatility control" rule as everywhere else in this
// domain) rather than returned with null fields.
const INDEX_DEFINITIONS: { symbol: string; exchange: string; name: string }[] = [
  { symbol: "NIFTY50", exchange: "NSE", name: "NIFTY 50" },
  { symbol: "NIFTYBANK", exchange: "NSE", name: "BANK NIFTY" },
  { symbol: "SENSEX", exchange: "BSE", name: "SENSEX" },
];

export async function getIndexQuotes() {
  // promise-all-db-concurrency-ok: Redis/HTTP-backed, not a Postgres query
  const results = await Promise.allSettled(
    INDEX_DEFINITIONS.map((def) => getCachedQuote(def.symbol, def.exchange)),
  );

  const indices = INDEX_DEFINITIONS.map((def, i) => {
    const result = results[i];
    const quote = result?.status === "fulfilled" ? result.value : null;
    if (!quote) return null;
    return {
      symbol: def.symbol,
      name: def.name,
      valuePaise: quote.pricePaise,
      changePaise: quote.changePaise,
      changePercent: quote.changePercent,
      asOf: quote.asOf.toISOString(),
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    data: { indices },
    disclaimer: TRADING_DISCLAIMER,
    disclaimerLocalized: TRADING_DISCLAIMER_LOCALIZED,
  };
}

// TR-05/16 - candlestick chart data for a timeframe.
export async function getInstrumentCandles(symbol: string, timeframe: MarketTimeframe) {
  const instrument = await getInstrumentBySymbol(symbol);
  if (!instrument || !instrument.active) {
    throw new AppError("NOT_FOUND", "No instrument with this symbol");
  }

  const candles = await getCachedCandles(instrument.symbol, instrument.exchange, timeframe);
  return {
    data: candles.map((c) => ({
      timestamp: c.timestamp.toISOString(),
      openPaise: c.openPaise,
      highPaise: c.highPaise,
      lowPaise: c.lowPaise,
      closePaise: c.closePaise,
      volume: c.volume,
    })),
    disclaimer: TRADING_DISCLAIMER,
    disclaimerLocalized: TRADING_DISCLAIMER_LOCALIZED,
  };
}
