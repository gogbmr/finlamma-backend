import { z } from "zod";
// Side-effect import: registers Zod's .openapi() extension method - see
// src/lib/openapi.ts.
import "@/lib/openapi";

// PR-25 (Profile - Trades): the portfolio hero + equity sparkline.
// D44 (docs/ARCHITECTURE.md): `allTimePnlPaise`/`allTimePnlPct` are TRADING
// P&L only (realized SELL gains/losses + unrealized gain/loss on current
// holdings), never compared against a fixed "starting deposit" - V Money is
// earned from many non-trading sources (lessons, badges, streaks), so
// there's no such baseline to compare the whole wallet against.
// `equityBarsPaise` is a real (not fabricated) trading equity curve built by
// replaying every fill chronologically - see src/server/portfolio/service.ts
// - up to 12 points; empty until at least one order has ever filled.
export const PortfolioSummaryResponseSchema = z.object({
  data: z.object({
    cashBalancePaise: z.number().int().openapi({
      description: "V Money balance, in paise. Same source as GET /me/wallet - summed live from vmoney_ledger.",
      example: 84000,
    }),
    holdingsMarketValuePaise: z.number().int().nonnegative().openapi({
      description: "Current holdings valued at the latest available quote (0 for any symbol with no quote right now).",
      example: 24420,
    }),
    totalValuePaise: z.number().int().openapi({
      description: "cashBalancePaise + holdingsMarketValuePaise.",
      example: 108420,
    }),
    allTimePnlPaise: z.number().int().openapi({
      description: "Realized P&L from every closed (SELL) trade ever, plus unrealized P&L on current holdings.",
      example: 8420,
    }),
    allTimePnlPct: z.number().openapi({
      description: "allTimePnlPaise as a percentage of total paise ever spent on BUY fills. 0 if nothing has ever been bought.",
      example: 8.4,
    }),
    equityBarsPaise: z.array(z.number().int()).max(12).openapi({
      description:
        "Up to 12 points sampled from a chronological replay of every fill (a trading equity curve, not a literal " +
        "daily mark-to-market - there's no historical daily-price table yet). Empty if nothing has ever filled.",
      example: [34000, 41000, 46000, 58000, 71000, 66000, 80000, 92000, 88000, 95000, 101000, 108420],
    }),
  }),
});

const BestWorstTradeSchema = z.object({
  symbol: z.string().openapi({ example: "ZOMATO" }),
  realizedPnlPaise: z.number().int().openapi({ example: 72000 }),
  filledAt: z.string().datetime().openapi({ example: "2026-08-14T10:12:00.000Z" }),
});

// PR-26/PR-27 (Profile - Trades): the trading-stats grid + win/loss split.
// D44: drops the prototype's "coins earned from trading" stat - our
// decided economy (money-ledger skill) never pays XP/VM for placing a
// trade, only for lessons/badges/streaks/rewards, so there is nothing real
// to show there.
export const PortfolioStatsResponseSchema = z.object({
  data: z.object({
    totalClosedTrades: z.number().int().nonnegative().openapi({ example: 42 }),
    realizedPnlPaise: z.number().int().openapi({
      description: "Sum of realizedPnlPaise across every closed (SELL) trade ever.",
      example: 624000,
    }),
    winCount: z.number().int().nonnegative().openapi({ example: 26 }),
    lossCount: z.number().int().nonnegative().openapi({ example: 16 }),
    winRatePct: z.number().openapi({
      description: "winCount / totalClosedTrades * 100. 0 if there are no closed trades yet.",
      example: 61.9,
    }),
    avgHoldDays: z.number().nullable().openapi({
      description: "Average days between a position's open and a SELL that closed it. null if there are no closed trades yet.",
      example: 3.4,
    }),
    bestTrade: BestWorstTradeSchema.nullable(),
    worstTrade: BestWorstTradeSchema.nullable(),
    openPositionsCount: z.number().int().nonnegative().openapi({
      description: "Current holdings with qty > 0.",
      example: 4,
    }),
  }),
});

// PR-28 (Profile - Trades): the trade-history list, filterable All/Open/
// Closed. D44's pagination contract: `cursor` only ever pages through
// CLOSED trades - `open` positions are a current snapshot, not a
// chronological log, so they're always returned in full on the FIRST page
// only (cursor absent) and omitted from every subsequent page, never
// duplicated across pages.
const OpenTradeRowSchema = z.object({
  kind: z.literal("open"),
  symbol: z.string().openapi({ example: "HDFCBANK" }),
  exchange: z.string().openapi({ example: "NSE" }),
  qty: z.number().int().positive().openapi({ example: 6 }),
  avgPricePaise: z.number().int().openapi({ example: 161200 }),
  livePricePaise: z.number().int().nullable().openapi({
    description: "null if no quote is available right now.",
    example: 166100,
  }),
  unrealizedPnlPaise: z.number().int().nullable().openapi({ example: 29400 }),
  unrealizedPnlPct: z.number().nullable().openapi({ example: 3.0 }),
  positionOpenedAt: z.string().datetime().openapi({ example: "2026-09-02T04:00:00.000Z" }),
});

const ClosedTradeRowSchema = z.object({
  kind: z.literal("closed"),
  symbol: z.string().openapi({ example: "TATAMOTORS" }),
  exchange: z.string().openapi({ example: "NSE" }),
  qty: z.number().int().positive().openapi({ example: 12 }),
  entryPricePaise: z.number().int().openapi({ example: 74200 }),
  exitPricePaise: z.number().int().openapi({ example: 80100 }),
  realizedPnlPaise: z.number().int().openapi({ example: 70800 }),
  realizedPnlPct: z.number().openapi({ example: 7.95 }),
  holdDays: z.number().int().nonnegative().openapi({ example: 4 }),
  filledAt: z.string().datetime().openapi({ example: "2026-09-10T09:20:00.000Z" }),
});

export const PortfolioTradeRowSchema = z.discriminatedUnion("kind", [OpenTradeRowSchema, ClosedTradeRowSchema]);

export const PortfolioTradesResponseSchema = z.object({
  data: z.array(PortfolioTradeRowSchema),
  nextCursor: z.string().nullable(),
});

export const PortfolioTradesStatusEnum = z.enum(["all", "open", "closed"]);
export type PortfolioTradesStatus = z.infer<typeof PortfolioTradesStatusEnum>;
