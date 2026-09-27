import { and, asc, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, instruments, orders } from "@/db/schema";
import { encodeCursor } from "@/lib/http";

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

// Checkpoint 7 (D43/D44) - the Profile Trades tab. Every read here is
// self-only (the service layer always passes the caller's own userId), so
// none of this needs a staff permission check.

// --- Positions (currently held, qty > 0) ---

export async function listOpenPositions(userId: string) {
  return db
    .select({
      symbol: instruments.symbol,
      exchange: instruments.exchange,
      qty: holdings.qty,
      avgPricePaise: holdings.avgPricePaise,
      positionOpenedAt: holdings.positionOpenedAt,
    })
    .from(holdings)
    .innerJoin(instruments, eq(holdings.instrumentId, instruments.id))
    .where(and(eq(holdings.userId, userId), sql`${holdings.qty} > 0`))
    .orderBy(asc(instruments.symbol));
}

export async function countOpenPositions(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<string | number>`count(*)` })
    .from(holdings)
    .where(and(eq(holdings.userId, userId), sql`${holdings.qty} > 0`));
  return toNumber(row?.count ?? 0);
}

// --- Cost basis / realized P&L (all-time, across every fill ever) ---

// Total paise ever spent on BUY fills - the denominator for "all-time P&L
// %", a trading-specific return-on-capital-deployed figure, deliberately
// NOT compared against total wallet value (V Money is earned from many
// non-trading sources too - see the money-ledger skill - so a fixed
// "starting balance" baseline the prototype assumes doesn't exist here).
export async function sumBuyCostBasisPaise(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | number>`coalesce(sum(${orders.qty} * ${orders.fillPricePaise}), 0)` })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.side, "buy"), eq(orders.status, "filled")));
  return toNumber(row?.total ?? 0);
}

export async function sumRealizedPnlPaise(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | number>`coalesce(sum(${orders.realizedPnlPaise}), 0)` })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.side, "sell"), eq(orders.status, "filled")));
  return toNumber(row?.total ?? 0);
}

// --- Equity curve (Portfolio summary's sparkline) ---

export type FilledOrderForReplay = {
  side: "buy" | "sell";
  qty: number;
  fillPricePaise: number;
  symbol: string;
  filledAt: Date;
};

// Every fill ever, oldest first - src/server/portfolio/service.ts replays
// this chronologically to build the equity curve (see D44 for why this is
// a "trading equity curve" derived from real fill prices, not a literal
// daily mark-to-market, since no historical daily-bar table exists yet).
export async function listFilledOrdersChronological(userId: string): Promise<FilledOrderForReplay[]> {
  const rows = await db
    .select({
      side: orders.side,
      qty: orders.qty,
      fillPricePaise: orders.fillPricePaise,
      symbol: instruments.symbol,
      filledAt: orders.filledAt,
    })
    .from(orders)
    .innerJoin(instruments, eq(orders.instrumentId, instruments.id))
    .where(and(eq(orders.userId, userId), eq(orders.status, "filled")))
    .orderBy(asc(orders.filledAt), asc(orders.id));

  // fillPricePaise/filledAt are nullable in the column type (an "open"
  // order never has either) - both are guaranteed set here by the
  // status = "filled" filter above.
  return rows.map((r) => ({
    side: r.side,
    qty: r.qty,
    fillPricePaise: r.fillPricePaise!,
    symbol: r.symbol,
    filledAt: r.filledAt!,
  }));
}

// --- Trading stats grid (win rate, hold time, best/worst trade) ---

export type ClosedTradeForStats = {
  symbol: string;
  realizedPnlPaise: number;
  filledAt: Date;
  holdDays: number;
};

// Every SELL fill ever, joined with the instrument's symbol and the
// holding's CURRENT positionOpenedAt for a hold-days figure. Known
// limitation (documented on holdings.positionOpenedAt and D44): if the
// position was fully exited and reopened again since a given historical
// sale, that sale's reported hold-days uses the LATEST positionOpenedAt,
// not the one that was true at the time - accepted rather than building
// full per-lot cost-basis tracking for it.
export async function listClosedTradesForStats(userId: string): Promise<ClosedTradeForStats[]> {
  const rows = await db
    .select({
      symbol: instruments.symbol,
      realizedPnlPaise: orders.realizedPnlPaise,
      filledAt: orders.filledAt,
      positionOpenedAt: holdings.positionOpenedAt,
    })
    .from(orders)
    .innerJoin(instruments, eq(orders.instrumentId, instruments.id))
    .innerJoin(holdings, and(eq(holdings.userId, orders.userId), eq(holdings.instrumentId, orders.instrumentId)))
    .where(and(eq(orders.userId, userId), eq(orders.side, "sell"), eq(orders.status, "filled")));

  const msPerDay = 24 * 60 * 60 * 1000;
  // realizedPnlPaise/filledAt are guaranteed set by the status = "filled",
  // side = "sell" filter above (see applyFillToHoldingTx).
  return rows.map((r) => ({
    symbol: r.symbol,
    realizedPnlPaise: r.realizedPnlPaise!,
    filledAt: r.filledAt!,
    holdDays: Math.max(0, Math.round((r.filledAt!.getTime() - r.positionOpenedAt.getTime()) / msPerDay)),
  }));
}

// --- Trade history list (`GET /me/portfolio/trades?status=`) ---

export type ClosedTradeCursor = { filledAt: string; id: string };

export type ClosedTradeRow = {
  id: string;
  symbol: string;
  exchange: string;
  qty: number;
  fillPricePaise: number;
  realizedPnlPaise: number;
  filledAt: Date;
  positionOpenedAt: Date;
};

// Cursor-paginated, newest first - same (sortKey, id) stable-cursor shape
// as src/server/economy/repo.ts's listVmoneyLedgerForUser.
export async function listClosedTradesPage(
  userId: string,
  opts: { limit: number; cursor: ClosedTradeCursor | null },
): Promise<{ data: ClosedTradeRow[]; nextCursor: string | null }> {
  const conditions = [eq(orders.userId, userId), eq(orders.side, "sell"), eq(orders.status, "filled")];
  if (opts.cursor) {
    const cursorFilledAt = new Date(opts.cursor.filledAt);
    conditions.push(
      or(
        lt(orders.filledAt, cursorFilledAt),
        and(eq(orders.filledAt, cursorFilledAt), lt(orders.id, opts.cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select({
      id: orders.id,
      symbol: instruments.symbol,
      exchange: instruments.exchange,
      qty: orders.qty,
      fillPricePaise: orders.fillPricePaise,
      realizedPnlPaise: orders.realizedPnlPaise,
      filledAt: orders.filledAt,
      positionOpenedAt: holdings.positionOpenedAt,
    })
    .from(orders)
    .innerJoin(instruments, eq(orders.instrumentId, instruments.id))
    .innerJoin(holdings, and(eq(holdings.userId, orders.userId), eq(holdings.instrumentId, orders.instrumentId)))
    .where(and(...conditions, isNotNull(orders.filledAt)))
    .orderBy(desc(orders.filledAt), desc(orders.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  // fillPricePaise/realizedPnlPaise/filledAt are guaranteed set by the
  // status = "filled", side = "sell" filter above.
  const page = (hasMore ? rows.slice(0, opts.limit) : rows).map((r) => ({
    id: r.id,
    symbol: r.symbol,
    exchange: r.exchange,
    qty: r.qty,
    fillPricePaise: r.fillPricePaise!,
    realizedPnlPaise: r.realizedPnlPaise!,
    filledAt: r.filledAt!,
    positionOpenedAt: r.positionOpenedAt,
  }));
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ filledAt: last.filledAt.toISOString(), id: last.id } satisfies ClosedTradeCursor)
      : null;

  return { data: page, nextCursor };
}
