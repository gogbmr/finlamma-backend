import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, instruments, orders, users } from "@/db/schema";
import { insertVmoneyLedgerEntryIfNew, sumVmoneyBalanceTx, type DbOrTx } from "@/server/economy/repo";
import { isMarketOpen } from "@/server/market/hours";
import { getRelayPrice } from "@/server/trading/relay-price";
import { getOrCreateMarketControls, listMarketHolidays } from "@/server/trading/repo";
import { clampFillPrice, isLimitMarketable } from "./pricing";
import type { PlaceOrderInput } from "./schemas";

// trading-rules skill: "If the price is older than 60s during market hours
// -> reject with PRICE_STALE."
const PRICE_STALE_MS = 60_000;

export type OrderRow = typeof orders.$inferSelect;

export async function getOrderByIdempotencyKeyTx(
  txDb: DbOrTx,
  userId: string,
  idempotencyKey: string,
): Promise<OrderRow | null> {
  const [row] = await txDb
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ?? null;
}

async function insertOrderTx(
  txDb: DbOrTx,
  values: {
    userId: string;
    instrumentId: string;
    side: "buy" | "sell";
    type: "market" | "limit";
    qty: number;
    limitPricePaise: number | null;
    idempotencyKey: string;
    status: "open" | "filled";
    fillPricePaise?: number;
    filledAt?: Date;
    realizedPnlPaise?: number | null;
  },
): Promise<OrderRow> {
  const [row] = await txDb.insert(orders).values(values).returning();
  return row!;
}

async function getHoldingTx(txDb: DbOrTx, userId: string, instrumentId: string) {
  const [row] = await txDb
    .select()
    .from(holdings)
    .where(and(eq(holdings.userId, userId), eq(holdings.instrumentId, instrumentId)))
    .limit(1);
  return row ?? null;
}

// Weighted-average-cost update, the standard rule: a BUY blends the new
// fill into the existing average ((oldQty*oldAvg + qty*fillPrice) /
// newQty); a SELL reduces qty WITHOUT changing the average - the shares
// that remain still cost what they always cost, selling some of them
// doesn't retroactively change that. Only ever called after the caller has
// already confirmed (for a SELL) that enough qty is held - never
// re-checks that here, so a negative qty is a caller bug, not a
// possibility this function guards against on its own.
//
// Checkpoint 7 (D43) additions: a BUY that finds the position at qty 0
// (a genuine re-entry after a full exit, not just "no row yet") resets
// `positionOpenedAt` to `now` - the Trades tab's hold-days stat is measured
// from there. A SELL returns its realized P&L (qty * (fillPrice - the
// average BEFORE this sale)) so the caller can store it on the order row -
// this is the only point where that cost basis is cheaply known, so it's
// computed once, here, rather than reconstructed later.
async function applyFillToHoldingTx(
  txDb: DbOrTx,
  userId: string,
  instrumentId: string,
  side: "buy" | "sell",
  qty: number,
  fillPricePaise: number,
  now: Date,
): Promise<{ realizedPnlPaise: number | null }> {
  const existing = await getHoldingTx(txDb, userId, instrumentId);

  if (side === "buy") {
    if (!existing) {
      await txDb
        .insert(holdings)
        .values({ userId, instrumentId, qty, avgPricePaise: fillPricePaise, positionOpenedAt: now });
      return { realizedPnlPaise: null };
    }
    const newQty = existing.qty + qty;
    const newAvgPricePaise = Math.round(
      (existing.qty * existing.avgPricePaise + qty * fillPricePaise) / newQty,
    );
    await txDb
      .update(holdings)
      .set({
        qty: newQty,
        avgPricePaise: newAvgPricePaise,
        ...(existing.qty === 0 ? { positionOpenedAt: now } : {}),
      })
      .where(eq(holdings.id, existing.id));
    return { realizedPnlPaise: null };
  }

  // sell - existing and existing.qty >= qty are both guaranteed by the
  // caller's own INSUFFICIENT_HOLDINGS check before this is ever reached.
  const realizedPnlPaise = qty * (fillPricePaise - existing!.avgPricePaise);
  await txDb.update(holdings).set({ qty: existing!.qty - qty }).where(eq(holdings.id, existing!.id));
  return { realizedPnlPaise };
}

export type PlaceOrderTxResult =
  | { status: "replayed"; order: OrderRow }
  | { status: "idempotency_conflict" }
  | { status: "market_halted" }
  | { status: "symbol_halted" }
  | { status: "market_paused" }
  | { status: "market_closed" }
  | { status: "price_unavailable" }
  | { status: "price_stale" }
  | { status: "insufficient_margin"; balancePaise: number; requiredPaise: number }
  | { status: "insufficient_holdings"; heldQty: number; requestedQty: number }
  | { status: "queued"; order: OrderRow }
  | { status: "filled"; order: OrderRow };

// The whole order-placement decision, one DB transaction, the user's row
// locked first (SELECT ... FOR UPDATE, same pattern as
// src/server/rewards/repo.ts's claimRewardTx - see D30/D26 for why locking
// BEFORE reading balance/holdings is what makes "never goes negative"
// actually hold under concurrency, not just in the common case). Never
// throws an AppError itself - returns a discriminated union instead, same
// convention as claimRewardTx; the service layer decides which statuses
// are errors and what to log. `instrument` is looked up by the caller
// BEFORE this transaction opens (existence/active/halted read once, not
// re-read inside the lock) - a deliberate simplification: an Ops console
// halt landing in the exact instant between that read and this
// transaction is a real but narrow race, and since nothing here is real
// money, "an order fills a moment before/after a halt" has no consequence
// worth holding the lock longer to prevent.
export async function placeOrderTx(
  userId: string,
  instrument: { id: string; symbol: string; exchange: string; halted: boolean },
  input: PlaceOrderInput,
  idempotencyKey: string,
  // Explicit, injectable "now" - the server's own clock, never client-
  // supplied (same D30 reasoning as every other IST-sensitive check in
  // this codebase) - defaults to the real clock for every production
  // caller. Threaded through explicitly (not read via `new Date()`
  // in-line) specifically so tests can pass a fixed instant directly,
  // the same pattern src/server/economy/service.ts's getVmoneyStats
  // already uses - vi.useFakeTimers() was tried here first and caused a
  // real, reproducible OOM crash, almost certainly from PGlite's own
  // internal timer-dependent async plumbing breaking under mocked
  // globals; this sidesteps that class of problem entirely rather than
  // working around it.
  now: Date = new Date(),
): Promise<PlaceOrderTxResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${users} where id = ${userId} for update`);

    const existing = await getOrderByIdempotencyKeyTx(tx, userId, idempotencyKey);
    if (existing) {
      const matches =
        existing.instrumentId === instrument.id &&
        existing.side === input.side &&
        existing.type === input.type &&
        existing.qty === input.qty &&
        (existing.limitPricePaise ?? null) === (input.limitPricePaise ?? null);
      return matches ? { status: "replayed", order: existing } : { status: "idempotency_conflict" };
    }

    const controls = await getOrCreateMarketControls(tx);
    if (controls.globalHalt) return { status: "market_halted" };
    if (instrument.halted) return { status: "symbol_halted" };
    if (controls.feedMode === "paused") return { status: "market_paused" };

    const marketHolidays = await listMarketHolidays(tx);
    const holidayDates = new Set(marketHolidays.map((h) => h.date));
    const marketOpen = isMarketOpen(now, holidayDates);

    if (input.type === "market" && !marketOpen) return { status: "market_closed" };

    const baseOrderValues = {
      userId,
      instrumentId: instrument.id,
      side: input.side,
      type: input.type,
      qty: input.qty,
      limitPricePaise: input.limitPricePaise ?? null,
      idempotencyKey,
    };

    // LIMIT order placed while the market's closed - queued as-is, no
    // price check at all (trading-rules skill / the founder's decision:
    // "LIMIT orders outside market hours stay OPEN until matched or
    // cancelled at day end" - Checkpoint 6 builds both the matching job
    // and the end-of-day cancel job).
    if (!marketOpen) {
      const order = await insertOrderTx(tx, { ...baseOrderValues, status: "open" });
      return { status: "queued", order };
    }

    const price = await getRelayPrice(instrument.symbol, instrument.exchange);
    if (!price) return { status: "price_unavailable" };
    if (now.getTime() - price.ts > PRICE_STALE_MS) return { status: "price_stale" };

    const marketable =
      input.type === "market" || isLimitMarketable(input.side, input.limitPricePaise!, price.pricePaise);

    if (!marketable) {
      const order = await insertOrderTx(tx, { ...baseOrderValues, status: "open" });
      return { status: "queued", order };
    }

    const fillPricePaise =
      input.type === "market" ? price.pricePaise : clampFillPrice(input.side, input.limitPricePaise!, price.pricePaise);
    const valuePaise = input.qty * fillPricePaise;

    if (input.side === "buy") {
      const balancePaise = await sumVmoneyBalanceTx(tx, userId);
      if (balancePaise < valuePaise) {
        return { status: "insufficient_margin", balancePaise, requiredPaise: valuePaise };
      }
    } else {
      const holding = await getHoldingTx(tx, userId, instrument.id);
      if (!holding || holding.qty < input.qty) {
        return { status: "insufficient_holdings", heldQty: holding?.qty ?? 0, requestedQty: input.qty };
      }
    }

    const filledAt = new Date();
    const { realizedPnlPaise } = await applyFillToHoldingTx(
      tx,
      userId,
      instrument.id,
      input.side,
      input.qty,
      fillPricePaise,
      filledAt,
    );

    const order = await insertOrderTx(tx, {
      ...baseOrderValues,
      status: "filled",
      fillPricePaise,
      filledAt,
      realizedPnlPaise,
    });

    // Ledger, same transaction, same idempotency mechanism as every other
    // money-moving write in this codebase (D26/D37) - sourceId is this
    // order's own freshly-generated id, so this insert can never conflict
    // with anything (a brand new UUID), the onConflictDoNothing path is
    // unreachable here in practice but kept for the same defense-in-depth
    // reasoning every other caller of this function relies on.
    await insertVmoneyLedgerEntryIfNew(tx, {
      userId,
      sourceType: "trade",
      sourceId: order.id,
      ruleId: null,
      reason: `${input.side.toUpperCase()} ${input.qty} ${instrument.symbol} @ ${fillPricePaise}`,
      amountPaise: input.side === "buy" ? -valuePaise : valuePaise,
      multiplierApplied: 1,
    });

    return { status: "filled", order };
  });
}

// Checkpoint 6: every "open" row in the `orders` table is a queued LIMIT
// order (placeOrderTx never persists a queued MARKET order - see the
// comment above), so this lists exactly the matching job's candidate set.
// Joined with `instruments` since the matching job needs symbol/exchange
// (for the Redis price lookup) and halted (to skip a halted symbol without
// a wasted transaction) without a second query per order.
export async function listOpenLimitOrdersWithInstrument() {
  return db
    .select({ order: orders, instrument: instruments })
    .from(orders)
    .innerJoin(instruments, eq(orders.instrumentId, instruments.id))
    .where(eq(orders.status, "open"));
}

export type MatchOrderResult =
  | { status: "already_settled" }
  | { status: "market_halted" }
  | { status: "symbol_halted" }
  | { status: "market_paused" }
  | { status: "market_closed" }
  | { status: "price_unavailable" }
  | { status: "price_stale" }
  | { status: "not_marketable" }
  | { status: "insufficient_margin"; balancePaise: number; requiredPaise: number }
  | { status: "insufficient_holdings"; heldQty: number; requestedQty: number }
  | { status: "filled"; order: OrderRow };

// One attempt to fill a single already-queued LIMIT order, called by the
// matching job's per-order step. Same transaction shape as placeOrderTx
// (lock the user's row first, same halt/pause/market-hours/price-staleness/
// margin-holdings checks, same ledger+holdings write) - this is
// deliberately a sibling function rather than a refactor to share code with
// placeOrderTx, since the two differ in one meaningful way: placeOrderTx
// is deciding whether a NEW request is accepted at all (so it makes sense
// for "market closed" to reject a MARKET order outright), while this is
// re-evaluating an order that already exists and was already accepted as
// "open" - it never rejects the order itself, only reports why THIS attempt
// didn't fill it, leaving it open for the next run (or the EOD cancel job).
export async function matchOpenLimitOrderTx(
  orderId: string,
  instrument: { id: string; symbol: string; exchange: string; halted: boolean },
  now: Date = new Date(),
): Promise<MatchOrderResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!current || current.status !== "open") return { status: "already_settled" };

    await tx.execute(sql`select id from ${users} where id = ${current.userId} for update`);

    const controls = await getOrCreateMarketControls(tx);
    if (controls.globalHalt) return { status: "market_halted" };
    if (instrument.halted) return { status: "symbol_halted" };
    if (controls.feedMode === "paused") return { status: "market_paused" };

    const marketHolidays = await listMarketHolidays(tx);
    const holidayDates = new Set(marketHolidays.map((h) => h.date));
    if (!isMarketOpen(now, holidayDates)) return { status: "market_closed" };

    const price = await getRelayPrice(instrument.symbol, instrument.exchange);
    if (!price) return { status: "price_unavailable" };
    if (now.getTime() - price.ts > PRICE_STALE_MS) return { status: "price_stale" };

    if (!isLimitMarketable(current.side, current.limitPricePaise!, price.pricePaise)) {
      return { status: "not_marketable" };
    }

    const fillPricePaise = clampFillPrice(current.side, current.limitPricePaise!, price.pricePaise);
    const valuePaise = current.qty * fillPricePaise;

    if (current.side === "buy") {
      const balancePaise = await sumVmoneyBalanceTx(tx, current.userId);
      if (balancePaise < valuePaise) {
        return { status: "insufficient_margin", balancePaise, requiredPaise: valuePaise };
      }
    } else {
      const holding = await getHoldingTx(tx, current.userId, instrument.id);
      if (!holding || holding.qty < current.qty) {
        return { status: "insufficient_holdings", heldQty: holding?.qty ?? 0, requestedQty: current.qty };
      }
    }

    const filledAt = new Date();
    const { realizedPnlPaise } = await applyFillToHoldingTx(
      tx,
      current.userId,
      instrument.id,
      current.side,
      current.qty,
      fillPricePaise,
      filledAt,
    );

    const [order] = await tx
      .update(orders)
      .set({ status: "filled", fillPricePaise, filledAt, realizedPnlPaise })
      .where(eq(orders.id, current.id))
      .returning();

    await insertVmoneyLedgerEntryIfNew(tx, {
      userId: current.userId,
      sourceType: "trade",
      sourceId: order!.id,
      ruleId: null,
      reason: `${current.side.toUpperCase()} ${current.qty} ${instrument.symbol} @ ${fillPricePaise}`,
      amountPaise: current.side === "buy" ? -valuePaise : valuePaise,
      multiplierApplied: 1,
    });

    return { status: "filled", order: order! };
  });
}

// End-of-day cancel (trading-rules skill / D41: "LIMIT orders outside
// market hours stay OPEN until matched or cancelled at day end"). Cancels
// every still-open order unconditionally - the caller (the Inngest cron) is
// responsible for only running this once, right after market close.
export async function cancelAllOpenOrdersTx(now: Date = new Date()): Promise<number> {
  const cancelled = await db
    .update(orders)
    .set({ status: "cancelled", cancelledAt: now })
    .where(eq(orders.status, "open"))
    .returning({ id: orders.id });
  return cancelled.length;
}
