import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - see
// src/lib/openapi.ts. Must be imported before any .openapi() call below.
import "@/lib/openapi";
import { MARKET_TIMEFRAMES } from "./types";

// TR-56 (docs/FEATURE_MAP.md) / CLAUDE.md's "never investment advice" rule:
// every screen that shows real prices/fundamentals must carry this note.
// Unlike the prototype's own copy (written for a fully-simulated mockup),
// this is accurate to what's actually built here - real NSE data via a
// live market-data vendor, used only for virtual paper trading with V
// Money, never real rupees. Returned as a response field (not hardcoded
// client copy) so it can be updated without an app release if the legal
// review (docs/ROADMAP.md pre-launch checklist) asks for different wording.
export const TRADING_DISCLAIMER =
  "Prices and charts are real NSE market data, used for virtual practice only. " +
  "Trades here use V Money, never real rupees. Nothing on this screen is investment advice.";

export const TimeframeSchema = z.enum(MARKET_TIMEFRAMES).openapi({
  description: "Chart timeframe.",
  example: "1M",
});

const QuoteSchema = z.object({
  pricePaise: z.number().int().openapi({ description: "Last traded price, in paise.", example: 284510 }),
  changePaise: z.number().int().openapi({ example: 1250 }),
  changePercent: z.number().openapi({ example: 0.44 }),
  openPaise: z.number().int().openapi({ example: 283000 }),
  highPaise: z.number().int().openapi({ example: 285200 }),
  lowPaise: z.number().int().openapi({ example: 282500 }),
  previousClosePaise: z.number().int().openapi({ example: 283260 }),
  volume: z.number().int().nonnegative().openapi({ example: 5231400 }),
  asOf: z.string().datetime().openapi({ description: "When this quote was captured by the market-data vendor." }),
});

// Explore mode (PRODUCT_SPEC.md §4) - visible to every user regardless of
// trading-unlock progress. `quote` is null when the vendor has no data for
// this symbol right now (e.g. between market close and the next session) -
// the app falls back to showing the instrument's last known values from
// its own fields, never a synthetic price (no volatility control, ever -
// docs/FEATURE_MAP.md Gaps -> Trade #6).
const InstrumentPublicSchema = z.object({
  symbol: z.string().openapi({ example: "RELIANCE" }),
  exchange: z.string().openapi({ example: "NSE" }),
  name: z.string().openapi({ example: "Reliance Industries Ltd" }),
  sector: z.string().openapi({ example: "Oil, Gas & Conglomerate" }),
  tags: z.array(z.string()).openapi({ example: ["NIFTY 50", "Large cap"] }),
  lotSize: z.number().int().openapi({ example: 1 }),
  halted: z.boolean(),
  quote: QuoteSchema.nullable(),
});

export const InstrumentListResponseSchema = z.object({
  data: z.array(InstrumentPublicSchema),
  disclaimer: z.string().openapi({ example: TRADING_DISCLAIMER }),
});

const LocalizedTextSchema = z.object({ en: z.string(), hi: z.string(), hx: z.string() });

const InstrumentDetailSchema = InstrumentPublicSchema.extend({
  about: LocalizedTextSchema,
  tip: LocalizedTextSchema,
  mcap: z.number().int().nullable().openapi({ description: "Whole rupees.", example: 1925000000000 }),
  pe: z.number().nullable().openapi({ example: 24.3 }),
});

export const InstrumentDetailResponseSchema = z.object({
  data: InstrumentDetailSchema,
  disclaimer: z.string().openapi({ example: TRADING_DISCLAIMER }),
});

const CandleSchema = z.object({
  timestamp: z.string().datetime(),
  openPaise: z.number().int(),
  highPaise: z.number().int(),
  lowPaise: z.number().int(),
  closePaise: z.number().int(),
  volume: z.number().int().nonnegative(),
});

export const CandlesResponseSchema = z.object({
  data: z.array(CandleSchema),
  disclaimer: z.string().openapi({ example: TRADING_DISCLAIMER }),
});
