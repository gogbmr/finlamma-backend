import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { getFundByIdInternal } from "@/server/funds/repo";
import { isTradingUnlocked } from "@/server/worlds/service";
import { placeFundOrderTx, type FundOrderRow } from "./repo";
import type { PlaceFundOrderInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

function shapeFundOrder(order: FundOrderRow, replayed: boolean) {
  return {
    id: order.id,
    fundId: order.fundId,
    side: order.side,
    status: order.status,
    amountPaise: order.amountPaise,
    unitsMilli: order.unitsMilli,
    navPaise: order.navPaise,
    navDate: order.navDate,
    realizedPnlPaise: order.realizedPnlPaise,
    createdAt: order.createdAt.toISOString(),
    replayed,
  };
}

// The fund order pad's one entry point - mirrors src/server/orders/
// service.ts's placeOrder exactly (same trading-unlock gate, same
// pre-check-before-transaction shape, same "every rejection is a thrown
// AppError with zero DB write" convention for a MANUAL order).
export async function placeFundOrder(
  user: { id: string },
  input: PlaceFundOrderInput,
  idempotencyKey: string,
  meta: RequestMeta,
) {
  const fund = await getFundByIdInternal(input.fundId);
  if (!fund || !fund.active) {
    throw new AppError("NOT_FOUND", "No fund with this id");
  }

  if (!(await isTradingUnlocked(user.id))) {
    throw new AppError("FORBIDDEN", "Trading is locked until you clear more worlds");
  }

  if (input.side === "buy" && input.amountPaise < fund.minLumpSumPaise) {
    throw new AppError("VALIDATION_FAILED", `Minimum investment for this fund is ${fund.minLumpSumPaise} paise`);
  }

  const result = await placeFundOrderTx(user.id, fund, input, idempotencyKey);

  switch (result.status) {
    case "idempotency_conflict":
      throw new AppError("IDEMPOTENCY_REPLAY", "This Idempotency-Key was already used for a different order");
    case "nav_unavailable":
      throw new AppError("NAV_UNAVAILABLE", "No NAV is available for this fund yet");
    case "nav_stale":
      throw new AppError("NAV_STALE", "The latest NAV is too old to trade on - ingestion may be stuck");
    case "insufficient_margin":
      throw new AppError("INSUFFICIENT_MARGIN", "Not enough V Money for this investment", {
        balancePaise: result.balancePaise,
        requiredPaise: result.requiredPaise,
      });
    case "insufficient_holdings":
      throw new AppError("INSUFFICIENT_HOLDINGS", "Not enough units held to redeem this amount", {
        heldUnitsMilli: result.heldUnitsMilli,
        requestedUnitsMilli: result.requestedUnitsMilli,
      });
    case "replayed":
      return shapeFundOrder(result.order, true);
    case "filled": {
      await logActivity({
        actorType: "user",
        actorId: user.id,
        action: "fund_order.filled",
        targetType: "fund_order",
        targetId: result.order.id,
        metadata: {
          fundId: input.fundId,
          side: input.side,
          navPaise: result.order.navPaise,
          navDate: result.order.navDate,
          unitsMilli: result.order.unitsMilli,
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return shapeFundOrder(result.order, false);
    }
  }
}
