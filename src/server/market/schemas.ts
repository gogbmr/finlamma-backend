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

// Phase 4 Trade asks (2026-10-20), additive: a {en, hi, hx} version of
// TRADING_DISCLAIMER, returned alongside the existing plain-string field
// (never replacing it - old clients keep working unchanged). Hindi/Hinglish
// copy is a best-effort draft, not yet reviewed by a native speaker
// (docs/ROADMAP.md's pre-launch checklist).
export const TRADING_DISCLAIMER_LOCALIZED = {
  en: TRADING_DISCLAIMER,
  hi: "कीमतें और चार्ट असली NSE बाज़ार डेटा हैं, सिर्फ़ वर्चुअल अभ्यास के लिए इस्तेमाल होते हैं। " +
    "यहाँ ट्रेड V Money से होते हैं, असली रुपयों से नहीं। इस स्क्रीन पर कुछ भी निवेश सलाह नहीं है।",
  hx: "Prices aur charts real NSE market data hain, sirf virtual practice ke liye. " +
    "Yahaan trades V Money se hote hain, real rupees se nahi. Is screen par kuch bhi investment advice nahi hai.",
};

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

const LocalizedTextSchema = z.object({ en: z.string(), hi: z.string(), hx: z.string() });

// Phase 4 Trade asks, additive: every disclaimer response field below also
// carries a disclaimerLocalized, the same {en, hi, hx} shape, alongside
// the existing plain-string field (kept for compatibility).
const DISCLAIMER_LOCALIZED_SHAPE = {
  disclaimer: z.string().openapi({ example: TRADING_DISCLAIMER }),
  disclaimerLocalized: LocalizedTextSchema.openapi({ example: TRADING_DISCLAIMER_LOCALIZED }),
};

export const InstrumentListResponseSchema = z.object({
  data: z.array(InstrumentPublicSchema),
  ...DISCLAIMER_LOCALIZED_SHAPE,
});

const InstrumentDetailSchema = InstrumentPublicSchema.extend({
  about: LocalizedTextSchema,
  tip: LocalizedTextSchema,
  mcap: z.number().int().nullable().openapi({ description: "Whole rupees.", example: 1925000000000 }),
  pe: z.number().nullable().openapi({ example: 24.3 }),
});

export const InstrumentDetailResponseSchema = z.object({
  data: InstrumentDetailSchema,
  ...DISCLAIMER_LOCALIZED_SHAPE,
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
  ...DISCLAIMER_LOCALIZED_SHAPE,
});

// TR-01/34/57 (docs/FEATURE_MAP.md): the market-status pill, the
// exchange-halted banner, and the order pad's lock/progress message all
// read from this one endpoint.
const MarketStatusSchema = z.object({
  marketOpen: z.boolean().openapi({
    description: "Whether NSE regular trading hours (09:15-15:30 IST, Mon-Fri, minus market_holidays) apply right now.",
  }),
  feedMode: z.enum(["live", "delayed_15m", "paused"]).openapi({ example: "live" }),
  globalHalt: z.boolean().openapi({
    description: "Ops console global halt - true means the order pad rejects every new order.",
  }),
  tradingUnlocked: z.boolean().openapi({
    description: "Whether this learner has passed the Boss Quiz at the configured unlock position (D25).",
  }),
  worldsToGo: z.number().int().nonnegative().openapi({
    description: "0 once unlocked. Otherwise how many more worlds' Boss Quizzes this learner needs to pass.",
    example: 2,
  }),
  recommendedPollIntervalMs: z.number().int().positive().openapi({
    description:
      "Phase 4 Trade asks (item 5): how often the app should re-poll this endpoint, in " +
      "milliseconds - server-controlled so the cadence can change (e.g. during a feed pause) " +
      "without an app release.",
    example: 5000,
  }),
});

export const MarketStatusResponseSchema = z.object({ data: MarketStatusSchema });

// App asks batch (2026-10-27), item A1: NIFTY 50 / BANK NIFTY / SENSEX index
// strip (TR-04, docs/FEATURE_MAP.md) - no `indices` DB table (docs/DATA_MODEL.md's
// Trading section: "indices reuse the same Twelve Data source and caching, no
// separate table"), so this is a fixed, code-defined list of index quotes,
// same provider/cache path as every other quote in this domain.
const IndexQuoteSchema = z.object({
  symbol: z.string().openapi({ description: "Our own index code, not a vendor-specific symbol.", example: "NIFTY50" }),
  name: z.string().openapi({ example: "NIFTY 50" }),
  valuePaise: z.number().int().openapi({
    description: "Index level, in paise (CLAUDE.md rule 2's integer-money convention applied to index points for consistency with every other price field in this API - an index level is not actually currency).",
    example: 2450035,
  }),
  changePaise: z.number().int().openapi({ example: 12500 }),
  changePercent: z.number().openapi({ example: 0.51 }),
  asOf: z.string().datetime().openapi({ description: "When this value was captured by the market-data vendor." }),
});

export const IndexQuotesResponseSchema = z.object({
  data: z.object({ indices: z.array(IndexQuoteSchema) }),
  ...DISCLAIMER_LOCALIZED_SHAPE,
});
