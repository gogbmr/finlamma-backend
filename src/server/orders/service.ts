import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { getInstrumentBySymbol } from "@/server/trading/repo";
import { isTradingUnlocked } from "@/server/worlds/service";
import { placeOrderTx, type OrderRow } from "./repo";
import type { PlaceOrderInput } from "./schemas";

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
    replayed,
  };
}

// The order-pad's one entry point (TR-30). Pre-checks (instrument lookup,
// trading-unlock) run BEFORE placeOrderTx opens its transaction/row-lock,
// so a bad symbol or a locked account never takes a lock at all. Every
// business-rule rejection from placeOrderTx maps to a distinct thrown
// AppError (never a persisted "rejected" order row - D41,
// docs/ARCHITECTURE.md); "queued"/"filled"/"replayed" are the only
// success paths, and only "queued"/"filled" log an activity entry - a
// replay is, by definition, something that already happened once.
export async function placeOrder(
  user: { id: string },
  input: PlaceOrderInput,
  idempotencyKey: string,
  meta: RequestMeta,
) {
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
      return shapeOrder(result.order, instrument.symbol, false);
    }
  }
}
