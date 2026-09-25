import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logInternalError } from "@/lib/http";
import type { Candle, MarketDataProvider, MarketTimeframe, Quote } from "../types";

const BASE_URL = "https://api.twelvedata.com";

// Maps OUR timeframe vocabulary (types.ts) to Twelve Data's own
// interval/outputsize params - the only place that mapping exists. A
// different vendor's adapter would have its own version of this table,
// never shared with this one (D38, docs/ARCHITECTURE.md).
const TIMEFRAME_TO_TWELVEDATA_PARAMS: Record<MarketTimeframe, { interval: string; outputsize: number }> = {
  "1D": { interval: "15min", outputsize: 26 }, // ~one NSE trading day (09:15-15:30 IST)
  "1W": { interval: "1h", outputsize: 35 },
  "1M": { interval: "1day", outputsize: 22 }, // ~trading days in a month
  "3M": { interval: "1day", outputsize: 65 },
  "1Y": { interval: "1week", outputsize: 52 },
};

// Twelve Data returns money as decimal-rupee strings ("1245.60") - this is
// the ONE place in the codebase that parses one of those, immediately
// converting to an exact integer paise value per CLAUDE.md rule 2. Never
// left as a float past this function.
function rupeeStringToPaise(value: string): number {
  return Math.round(Number.parseFloat(value) * 100);
}

function getApiKey(): string | null {
  return env.TWELVEDATA_API_KEY ?? null;
}

type TwelveDataQuoteResponse = {
  symbol?: string;
  exchange?: string;
  datetime?: string;
  timestamp?: number;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  volume?: string;
  status?: string;
  code?: number;
  message?: string;
};

type TwelveDataTimeSeriesResponse = {
  values?: {
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }[];
  status?: string;
  code?: number;
  message?: string;
};

export class TwelveDataProvider implements MarketDataProvider {
  async getQuote(symbol: string, exchange: string): Promise<Quote | null> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new AppError("SERVICE_UNAVAILABLE", "Market data is not configured");
    }

    const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}&apikey=${apiKey}`;
    let body: TwelveDataQuoteResponse;
    try {
      const res = await fetch(url);
      body = (await res.json()) as TwelveDataQuoteResponse;
    } catch (err) {
      logInternalError("market.twelvedata_quote_fetch_failed", err);
      throw new AppError("SERVICE_UNAVAILABLE", "Could not reach the market data provider");
    }

    // Twelve Data returns status: "error" (with a code/message) rather than
    // a non-2xx HTTP status for most failures, including "no data for this
    // symbol" - treated as "no quote available", not a thrown error, so
    // callers can map it to PRICE_UNAVAILABLE (the founder's decision)
    // rather than a raw 503.
    if (body.status === "error" || !body.close) {
      return null;
    }

    return {
      symbol: body.symbol ?? symbol,
      exchange: body.exchange ?? exchange,
      pricePaise: rupeeStringToPaise(body.close),
      changePaise: body.change ? rupeeStringToPaise(body.change) : 0,
      changePercent: body.percent_change ? Number.parseFloat(body.percent_change) : 0,
      openPaise: body.open ? rupeeStringToPaise(body.open) : rupeeStringToPaise(body.close),
      highPaise: body.high ? rupeeStringToPaise(body.high) : rupeeStringToPaise(body.close),
      lowPaise: body.low ? rupeeStringToPaise(body.low) : rupeeStringToPaise(body.close),
      previousClosePaise: body.previous_close
        ? rupeeStringToPaise(body.previous_close)
        : rupeeStringToPaise(body.close),
      volume: body.volume ? Number.parseInt(body.volume, 10) : 0,
      asOf: body.timestamp ? new Date(body.timestamp * 1000) : new Date(),
    };
  }

  async getCandles(symbol: string, exchange: string, timeframe: MarketTimeframe): Promise<Candle[]> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new AppError("SERVICE_UNAVAILABLE", "Market data is not configured");
    }

    const { interval, outputsize } = TIMEFRAME_TO_TWELVEDATA_PARAMS[timeframe];
    const url =
      `${BASE_URL}/time_series?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}` +
      `&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;

    let body: TwelveDataTimeSeriesResponse;
    try {
      const res = await fetch(url);
      body = (await res.json()) as TwelveDataTimeSeriesResponse;
    } catch (err) {
      logInternalError("market.twelvedata_candles_fetch_failed", err);
      throw new AppError("SERVICE_UNAVAILABLE", "Could not reach the market data provider");
    }

    if (body.status === "error" || !body.values) {
      return [];
    }

    // Twelve Data returns candles newest-first - normalized to oldest-first
    // here, the shape every chart-rendering caller in this codebase expects.
    return body.values
      .map((v) => ({
        timestamp: new Date(v.datetime),
        openPaise: rupeeStringToPaise(v.open),
        highPaise: rupeeStringToPaise(v.high),
        lowPaise: rupeeStringToPaise(v.low),
        closePaise: rupeeStringToPaise(v.close),
        volume: Number.parseInt(v.volume, 10),
      }))
      .reverse();
  }
}
