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
import { TRADING_DISCLAIMER } from "./schemas";
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
  const quotes = await Promise.allSettled(
    instruments.map((i) => getCachedQuote(i.symbol, i.exchange)),
  );

  return {
    data: instruments.map((instrument, i) => {
      const result = quotes[i];
      return {
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        name: instrument.name,
        sector: instrument.sector,
        tags: instrument.tags,
        lotSize: instrument.lotSize,
        halted: instrument.halted,
        quote: result?.status === "fulfilled" ? shapeQuote(result.value) : null,
      };
    }),
    disclaimer: TRADING_DISCLAIMER,
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
  };
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

  return {
    marketOpen: isMarketOpen(new Date(), holidayDates),
    feedMode: controls.feedMode,
    globalHalt: controls.globalHalt,
    tradingUnlocked: progress.unlocked,
    worldsToGo: progress.worldsToGo,
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
  };
}
