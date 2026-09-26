import { sumVmoneyBalance } from "@/server/economy/repo";
import { decodeCursor } from "@/lib/http";
import { getCachedQuote } from "@/server/market/cache";
import {
  countOpenPositions,
  listClosedTradesForStats,
  listClosedTradesPage,
  listFilledOrdersChronological,
  listOpenPositions,
  sumBuyCostBasisPaise,
  sumRealizedPnlPaise,
  type ClosedTradeCursor,
  type FilledOrderForReplay,
} from "./repo";
import type { PortfolioTradesStatus } from "./schemas";

const EQUITY_CURVE_MAX_BARS = 12;

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

// A trading equity curve, not a literal daily mark-to-market (D44,
// docs/ARCHITECTURE.md) - there's no historical daily-price table yet, so
// this replays every fill chronologically, valuing anything still held at
// its own LAST FILL price at each step, and swaps in live quotes only for
// the very last point (the current instant). Pure aside from the
// `livePricesBySymbol` lookup the caller already did - easy to test with a
// canned order list and no DB/Redis.
export function buildEquityCurve(
  filledOrders: FilledOrderForReplay[],
  livePricesBySymbol: ReadonlyMap<string, number>,
  maxBars = EQUITY_CURVE_MAX_BARS,
): number[] {
  if (filledOrders.length === 0) return [];

  const lastPriceBySymbol = new Map<string, number>();
  const heldQtyBySymbol = new Map<string, number>();
  let cashFlowPaise = 0;
  const points: number[] = [];

  for (const o of filledOrders) {
    lastPriceBySymbol.set(o.symbol, o.fillPricePaise);
    const prevQty = heldQtyBySymbol.get(o.symbol) ?? 0;
    if (o.side === "buy") {
      cashFlowPaise -= o.qty * o.fillPricePaise;
      heldQtyBySymbol.set(o.symbol, prevQty + o.qty);
    } else {
      cashFlowPaise += o.qty * o.fillPricePaise;
      heldQtyBySymbol.set(o.symbol, prevQty - o.qty);
    }

    let marketValuePaise = 0;
    for (const [symbol, qty] of heldQtyBySymbol) {
      if (qty <= 0) continue;
      marketValuePaise += qty * (lastPriceBySymbol.get(symbol) ?? 0);
    }
    points.push(cashFlowPaise + marketValuePaise);
  }

  // Final bar: revalue anything still held at its LIVE price instead of its
  // last fill price, so "now" reflects the market, not history.
  let liveMarketValuePaise = 0;
  for (const [symbol, qty] of heldQtyBySymbol) {
    if (qty <= 0) continue;
    const livePrice = livePricesBySymbol.get(symbol) ?? lastPriceBySymbol.get(symbol) ?? 0;
    liveMarketValuePaise += qty * livePrice;
  }
  points[points.length - 1] = cashFlowPaise + liveMarketValuePaise;

  if (points.length <= maxBars) return points;
  const step = (points.length - 1) / (maxBars - 1);
  return Array.from({ length: maxBars }, (_, i) => points[Math.round(i * step)]!);
}

export async function getPortfolioSummary(userId: string) {
  const [cashBalancePaise, openPositions, filledOrders, costBasisPaise, realizedPnlPaise] = await Promise.all([
    sumVmoneyBalance(userId),
    listOpenPositions(userId),
    listFilledOrdersChronological(userId),
    sumBuyCostBasisPaise(userId),
    sumRealizedPnlPaise(userId),
  ]);

  const quotes = await Promise.allSettled(
    openPositions.map((p) => getCachedQuote(p.symbol, p.exchange)),
  );
  const livePricesBySymbol = new Map<string, number>();
  let unrealizedPnlPaise = 0;
  let holdingsMarketValuePaise = 0;
  openPositions.forEach((p, i) => {
    const result = quotes[i];
    const price = result?.status === "fulfilled" ? result.value?.pricePaise ?? null : null;
    if (price !== null) {
      livePricesBySymbol.set(p.symbol, price);
      holdingsMarketValuePaise += p.qty * price;
      unrealizedPnlPaise += p.qty * (price - p.avgPricePaise);
    }
  });

  const allTimePnlPaise = realizedPnlPaise + unrealizedPnlPaise;
  const allTimePnlPct = costBasisPaise > 0 ? roundPct((allTimePnlPaise / costBasisPaise) * 100) : 0;
  const equityBarsPaise = buildEquityCurve(filledOrders, livePricesBySymbol);

  return {
    cashBalancePaise,
    holdingsMarketValuePaise,
    totalValuePaise: cashBalancePaise + holdingsMarketValuePaise,
    allTimePnlPaise,
    allTimePnlPct,
    equityBarsPaise,
  };
}

export async function getPortfolioStats(userId: string) {
  const [closedTrades, openPositionsCount, realizedPnlPaise] = await Promise.all([
    listClosedTradesForStats(userId),
    countOpenPositions(userId),
    sumRealizedPnlPaise(userId),
  ]);

  const totalClosedTrades = closedTrades.length;
  const winners = closedTrades.filter((t) => t.realizedPnlPaise > 0);
  const winCount = winners.length;
  const lossCount = totalClosedTrades - winCount;
  const winRatePct = totalClosedTrades > 0 ? roundPct((winCount / totalClosedTrades) * 100) : 0;
  const avgHoldDays =
    totalClosedTrades > 0
      ? roundPct(closedTrades.reduce((sum, t) => sum + t.holdDays, 0) / totalClosedTrades)
      : null;

  const best = closedTrades.reduce<(typeof closedTrades)[number] | null>(
    (acc, t) => (!acc || t.realizedPnlPaise > acc.realizedPnlPaise ? t : acc),
    null,
  );
  const worst = closedTrades.reduce<(typeof closedTrades)[number] | null>(
    (acc, t) => (!acc || t.realizedPnlPaise < acc.realizedPnlPaise ? t : acc),
    null,
  );

  return {
    totalClosedTrades,
    realizedPnlPaise,
    winCount,
    lossCount,
    winRatePct,
    avgHoldDays,
    bestTrade: best ? { symbol: best.symbol, realizedPnlPaise: best.realizedPnlPaise, filledAt: best.filledAt.toISOString() } : null,
    worstTrade: worst ? { symbol: worst.symbol, realizedPnlPaise: worst.realizedPnlPaise, filledAt: worst.filledAt.toISOString() } : null,
    openPositionsCount,
  };
}

function shapeOpenRow(
  p: Awaited<ReturnType<typeof listOpenPositions>>[number],
  livePricePaise: number | null,
) {
  const unrealizedPnlPaise = livePricePaise !== null ? p.qty * (livePricePaise - p.avgPricePaise) : null;
  const costBasisPaise = p.qty * p.avgPricePaise;
  return {
    kind: "open" as const,
    symbol: p.symbol,
    exchange: p.exchange,
    qty: p.qty,
    avgPricePaise: p.avgPricePaise,
    livePricePaise,
    unrealizedPnlPaise,
    unrealizedPnlPct:
      unrealizedPnlPaise !== null && costBasisPaise > 0 ? roundPct((unrealizedPnlPaise / costBasisPaise) * 100) : null,
    positionOpenedAt: p.positionOpenedAt.toISOString(),
  };
}

function shapeClosedRow(t: Awaited<ReturnType<typeof listClosedTradesPage>>["data"][number]) {
  const entryPricePaise = t.fillPricePaise - Math.round(t.realizedPnlPaise / t.qty);
  const costBasisPaise = entryPricePaise * t.qty;
  const msPerDay = 24 * 60 * 60 * 1000;
  return {
    kind: "closed" as const,
    symbol: t.symbol,
    exchange: t.exchange,
    qty: t.qty,
    entryPricePaise,
    exitPricePaise: t.fillPricePaise,
    realizedPnlPaise: t.realizedPnlPaise,
    realizedPnlPct: costBasisPaise > 0 ? roundPct((t.realizedPnlPaise / costBasisPaise) * 100) : 0,
    holdDays: Math.max(0, Math.round((t.filledAt.getTime() - t.positionOpenedAt.getTime()) / msPerDay)),
    filledAt: t.filledAt.toISOString(),
  };
}

// D44's pagination contract: `cursor` only ever pages through CLOSED
// trades. Open positions are a current snapshot, not a chronological log -
// they're returned in full on the first page only (no cursor given) and
// never duplicated on later pages.
export async function getPortfolioTrades(
  userId: string,
  opts: { status: PortfolioTradesStatus; limit: number; cursor: string | null },
) {
  const decodedCursor = decodeCursor<ClosedTradeCursor>(opts.cursor);
  const includeOpen = opts.status !== "closed" && !decodedCursor;
  const includeClosed = opts.status !== "open";

  const [openPositions, closedPage] = await Promise.all([
    includeOpen ? listOpenPositions(userId) : Promise.resolve([]),
    includeClosed ? listClosedTradesPage(userId, { limit: opts.limit, cursor: decodedCursor }) : Promise.resolve({ data: [], nextCursor: null }),
  ]);

  const quotes = await Promise.allSettled(openPositions.map((p) => getCachedQuote(p.symbol, p.exchange)));
  const openRows = openPositions.map((p, i) => {
    const result = quotes[i];
    const price = result?.status === "fulfilled" ? result.value?.pricePaise ?? null : null;
    return shapeOpenRow(p, price);
  });

  const closedRows = closedPage.data.map(shapeClosedRow);

  return { data: [...openRows, ...closedRows], nextCursor: closedPage.nextCursor };
}
