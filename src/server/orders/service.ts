import { captureEvent } from "@/lib/analytics";
import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import { decodeCursor, type requestMeta } from "@/lib/http";
import { checkRateLimit, TRADE_ORDER_RATE_LIMIT } from "@/lib/redis";
import { getInstrumentById, getInstrumentBySymbol } from "@/server/trading/repo";
import { isTradingUnlocked } from "@/server/worlds/service";
import {
  cancelOrderTx,
  listOrdersForUserPage,
  placeOrderTx,
  type OrderListCursor,
  type OrderListRow,
  type OrderRow,
} from "./repo";
import type { ListOrdersStatus, PlaceOrderInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

function shapeOrder(order: OrderRow, symbol: string, replayed: boolean) {
  return {
    id: order.id,
    symbol,
    side: order.side,
    type: order.type,
    qty: order.qty,
    limitPricePaise: order.limitPricePaise,
    status: order.status,
    fillPricePaise: order.fillPricePaise,
    createdAt: order.createdAt.toISOString(),
    filledAt: order.filledAt ? order.filledAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    cancelReason: order.cancelReason,
    replayed,
  };
}

function shapeOrderListRow(row: OrderListRow) {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    type: row.type,
    qty: row.qty,
    limitPricePaise: row.limitPricePaise,
    status: row.status,
    fillPricePaise: row.fillPricePaise,
    createdAt: row.createdAt.toISOString(),
    filledAt: row.filledAt ? row.filledAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    cancelReason: row.cancelReason,
  };
}

// TR-13 (Phase 4 Trade asks) - self-only by construction: userId always
// comes from the authenticated caller (the route handler), never from a
// query param, so there is no way to ask for another learner's orders.
export async function listMyOrders(
  userId: string,
  opts: { status?: ListOrdersStatus; idempotencyKey?: string; limit: number; cursor: string | null },
) {
  const decodedCursor = decodeCursor<OrderListCursor>(opts.cursor);
  const { data, nextCursor } = await listOrdersForUserPage(userId, {
    limit: opts.limit,
    cursor: decodedCursor,
    status: opts.status,
    idempotencyKey: opts.idempotencyKey,
  });
  return { data: data.map(shapeOrderListRow), nextCursor };
}

// Phase 4 Trade asks (2026-10-20): cancel one of the caller's own pending
// orders. not_found covers both "no such order" and "exists but isn't
// yours" (cancelOrderTx scopes its lookup by (id, userId) together) - the
// same AppError either way, so an order id can never be probed to learn
// whether it exists. already_cancelled is an idempotent success (no
// activity log - nothing new happened); not_cancellable (already filled,
// or already expired at end-of-day) is a distinct error naming the
// current status, never silently treated as success.
export async function cancelMyOrder(userId: string, orderId: string, meta: RequestMeta) {
  const result = await cancelOrderTx(userId, orderId);

  if (result.status === "not_found") {
    throw new AppError("NOT_FOUND", "No order with this id");
  }
  if (result.status === "not_cancellable") {
    throw new AppError(
      "ORDER_NOT_CANCELLABLE",
      `Cannot cancel an order that is already ${result.order.status}`,
      { status: result.order.status },
    );
  }

  const instrument = await getInstrumentById(result.order.instrumentId);
  const symbol = instrument?.symbol ?? "";
  const exchange = instrument?.exchange ?? "";

  if (result.status === "cancelled") {
    await logActivity({
      actorType: "user",
      actorId: userId,
      action: "order.cancelled",
      targetType: "order",
      targetId: result.order.id,
      metadata: { symbol, side: result.order.side, qty: result.order.qty },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return shapeOrderListRow({ ...result.order, symbol, exchange });
}

// The order-pad's one entry point (TR-30). Rate-limited first (D49 audit
// follow-up) - failOpen: false, same reasoning as claimReward
// (src/server/rewards/service.ts): this spends real V Money, so refusing
// when the limit can't be verified is safer than risking unbounded spend.
// Pre-checks (instrument lookup, trading-unlock) run BEFORE placeOrderTx
// opens its transaction/row-lock, so a bad symbol or a locked account never
// takes a lock at all. Every business-rule rejection from placeOrderTx maps
// to a distinct thrown AppError (never a persisted "rejected" order row -
// D41, docs/ARCHITECTURE.md); "queued"/"filled"/"replayed" are the only
// success paths, and only "queued"/"filled" log an activity entry - a
// replay is, by definition, something that already happened once.
export async function placeOrder(
  user: { id: string },
  input: PlaceOrderInput,
  idempotencyKey: string,
  meta: RequestMeta,
) {
  const { allowed } = await checkRateLimit(user.id, TRADE_ORDER_RATE_LIMIT, false);
  if (!allowed) {
    throw new AppError("RATE_LIMITED", "Too many order attempts - slow down and try again shortly");
  }

  const instrument = await getInstrumentBySymbol(input.symbol);
  if (!instrument || !instrument.active) {
    throw new AppError("NOT_FOUND", "No instrument with this symbol");
  }

  if (!(await isTradingUnlocked(user.id))) {
    throw new AppError("FORBIDDEN", "Trading is locked until you clear more worlds");
  }

  const result = await placeOrderTx(user.id, instrument, input, idempotencyKey);

  switch (result.status) {
    case "idempotency_conflict":
      throw new AppError("IDEMPOTENCY_REPLAY", "This Idempotency-Key was already used for a different order");
    case "market_halted":
      throw new AppError("MARKET_HALTED", "Trading is halted by exchange ops right now");
    case "symbol_halted":
      throw new AppError("SYMBOL_HALTED", `${instrument.symbol} is halted right now`);
    case "market_paused":
      throw new AppError("MARKET_PAUSED", "The market feed is paused right now");
    case "market_closed":
      throw new AppError("MARKET_CLOSED", "Market orders can only be placed during NSE trading hours (09:15-15:30 IST, Mon-Fri)");
    case "price_unavailable":
      throw new AppError("PRICE_UNAVAILABLE", "No current price is available for this instrument right now");
    case "price_stale":
      throw new AppError("PRICE_STALE", "The latest price is too old to trade on - try again shortly");
    case "insufficient_margin":
      throw new AppError("INSUFFICIENT_MARGIN", "Not enough V Money for this order", {
        balancePaise: result.balancePaise,
        requiredPaise: result.requiredPaise,
      });
    case "insufficient_holdings":
      throw new AppError("INSUFFICIENT_HOLDINGS", "Not enough shares held for this order", {
        heldQty: result.heldQty,
        requestedQty: result.requestedQty,
      });
    case "replayed":
      return shapeOrder(result.order, instrument.symbol, true);
    case "queued":
    case "filled": {
      await logActivity({
        actorType: "user",
        actorId: user.id,
        action: result.status === "filled" ? "order.filled" : "order.queued",
        targetType: "order",
        targetId: result.order.id,
        metadata: {
          symbol: instrument.symbol,
          side: input.side,
          type: input.type,
          qty: input.qty,
          fillPricePaise: result.order.fillPricePaise,
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      // docs/ARCHITECTURE.md D69 - deliberately coarse (sector, not symbol
      // or qty): enough to see trading engagement without logging a
      // minor's specific position size to a third party.
      captureEvent(user.id, "trade_order_placed", {
        side: input.side,
        status: result.status,
        sector: instrument.sector,
      });
      return shapeOrder(result.order, instrument.symbol, false);
    }
  }
}
