import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { fundHoldings, fundOrders, sipPlans, users } from "@/db/schema";
import { insertVmoneyLedgerEntryIfNew, sumVmoneyBalanceTx, type DbOrTx } from "@/server/economy/repo";
import { getLatestNav } from "@/server/funds/repo";
import { daysBetweenIstDates, istDateString } from "@/lib/ist-date";
import type { BuyFundInput, SellFundInput } from "./schemas";

// Founder's Checkpoint 8 requirement: "4 days, not 7 - funds price every
// business day; 4 survives a long weekend but catches a dead pipeline
// fast." A 3-day weekend (Fri close -> Mon open) is 3 days between NAV
// dates, so 4 leaves one spare day of slack before this fires.
const NAV_STALE_DAYS = 4;

export type OrderSide = "buy" | "sell";
export type FundOrderRow = typeof fundOrders.$inferSelect;

async function getFundHoldingTx(txDb: DbOrTx, userId: string, fundId: string) {
  const [row] = await txDb
    .select()
    .from(fundHoldings)
    .where(and(eq(fundHoldings.userId, userId), eq(fundHoldings.fundId, fundId)))
    .limit(1);
  return row ?? null;
}

// Same weighted-average-cost shape as src/server/orders/repo.ts's
// applyFillToHoldingTx, scaled for fractional units (unitsMilli = units x
// 1000, D45) instead of a whole-share qty. A SELL returns its realized P&L
// so the caller can store it on the order row, same reasoning as D43.
async function applyFillToFundHoldingTx(
  txDb: DbOrTx,
  userId: string,
  fundId: string,
  side: OrderSide,
  unitsMilli: number,
  navPaise: number,
): Promise<{ realizedPnlPaise: number | null }> {
  const existing = await getFundHoldingTx(txDb, userId, fundId);

  if (side === "buy") {
    if (!existing) {
      await txDb.insert(fundHoldings).values({ userId, fundId, unitsMilli, avgNavPaise: navPaise });
      return { realizedPnlPaise: null };
    }
    const newUnitsMilli = existing.unitsMilli + unitsMilli;
    const newAvgNavPaise = Math.round(
      (existing.unitsMilli * existing.avgNavPaise + unitsMilli * navPaise) / newUnitsMilli,
    );
    await txDb
      .update(fundHoldings)
      .set({ unitsMilli: newUnitsMilli, avgNavPaise: newAvgNavPaise })
      .where(eq(fundHoldings.id, existing.id));
    return { realizedPnlPaise: null };
  }

  // sell - existing and existing.unitsMilli >= unitsMilli are both
  // guaranteed by the caller's own INSUFFICIENT_HOLDINGS check.
  const realizedPnlPaise = Math.round((unitsMilli * (navPaise - existing!.avgNavPaise)) / 1000);
  await txDb
    .update(fundHoldings)
    .set({ unitsMilli: existing!.unitsMilli - unitsMilli })
    .where(eq(fundHoldings.id, existing!.id));
  return { realizedPnlPaise };
}

export async function getFundOrderByIdempotencyKeyTx(txDb: DbOrTx, userId: string, idempotencyKey: string) {
  const [row] = await txDb
    .select()
    .from(fundOrders)
    .where(and(eq(fundOrders.userId, userId), eq(fundOrders.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ?? null;
}

export type PlaceFundOrderResult =
  | { status: "replayed"; order: FundOrderRow }
  | { status: "idempotency_conflict" }
  | { status: "nav_unavailable" }
  | { status: "nav_stale" }
  | { status: "insufficient_margin"; balancePaise: number; requiredPaise: number }
  | { status: "insufficient_holdings"; heldUnitsMilli: number; requestedUnitsMilli: number }
  | { status: "filled"; order: FundOrderRow };

// Manual (interactive) buy/sell, gated by an Idempotency-Key header like
// every other order endpoint (CLAUDE.md rule 3). Unlike stock orders there
// is no LIMIT/MARKET distinction and no "queued" state - a fund fill either
// executes immediately against the latest ingested NAV or the whole
// request is rejected outright (thrown AppError, zero DB write - same D41
// convention). `now` is explicit/injectable for the same PGlite/fake-timer
// reason D41 documents.
export async function placeFundOrderTx(
  userId: string,
  fund: { id: string; active: boolean },
  input: BuyFundInput | SellFundInput,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<PlaceFundOrderResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${users} where id = ${userId} for update`);

    const existingOrder = await getFundOrderByIdempotencyKeyTx(tx, userId, idempotencyKey);
    if (existingOrder) {
      const matches =
        existingOrder.fundId === fund.id &&
        existingOrder.side === input.side &&
        (input.side === "buy" ? existingOrder.amountPaise === input.amountPaise : existingOrder.unitsMilli === input.unitsMilli);
      return matches ? { status: "replayed", order: existingOrder } : { status: "idempotency_conflict" };
    }

    const nav = await getLatestNav(fund.id, tx);
    if (!nav) return { status: "nav_unavailable" };
    const todayIst = istDateString(now);
    if (daysBetweenIstDates(nav.date, todayIst) > NAV_STALE_DAYS) return { status: "nav_stale" };

    let unitsMilli: number;
    let amountPaise: number;

    if (input.side === "buy") {
      amountPaise = input.amountPaise;
      const balancePaise = await sumVmoneyBalanceTx(tx, userId);
      if (balancePaise < amountPaise) {
        return { status: "insufficient_margin", balancePaise, requiredPaise: amountPaise };
      }
      unitsMilli = Math.round((amountPaise * 1000) / nav.navPaise);
    } else {
      unitsMilli = input.unitsMilli;
      const holding = await getFundHoldingTx(tx, userId, fund.id);
      if (!holding || holding.unitsMilli < unitsMilli) {
        return {
          status: "insufficient_holdings",
          heldUnitsMilli: holding?.unitsMilli ?? 0,
          requestedUnitsMilli: unitsMilli,
        };
      }
      amountPaise = Math.round((unitsMilli * nav.navPaise) / 1000);
    }

    const { realizedPnlPaise } = await applyFillToFundHoldingTx(tx, userId, fund.id, input.side, unitsMilli, nav.navPaise);

    const [order] = await tx
      .insert(fundOrders)
      .values({
        userId,
        fundId: fund.id,
        side: input.side,
        status: "filled",
        amountPaise,
        unitsMilli,
        navPaise: nav.navPaise,
        navDate: nav.date,
        realizedPnlPaise,
        idempotencyKey,
      })
      .returning();

    await insertVmoneyLedgerEntryIfNew(tx, {
      userId,
      sourceType: "fund_trade",
      sourceId: order!.id,
      ruleId: null,
      reason: `${input.side.toUpperCase()} fund units @ NAV ${nav.navPaise} (${nav.date})`,
      amountPaise: input.side === "buy" ? -amountPaise : amountPaise,
      multiplierApplied: 1,
    });

    return { status: "filled", order: order! };
  });
}

export async function listFundHoldings(userId: string) {
  return db.select().from(fundHoldings).where(and(eq(fundHoldings.userId, userId), sql`${fundHoldings.unitsMilli} > 0`));
}

// --- SIP execution (src/inngest/functions/sip-execution.ts) ---

export type SipDueResult =
  | { status: "already_executed" }
  | { status: "nav_unavailable" }
  | { status: "nav_stale" }
  | { status: "insufficient_margin"; balancePaise: number; requiredPaise: number }
  | { status: "filled"; order: FundOrderRow }
  | { status: "failed_recorded"; order: FundOrderRow };

// One SIP plan's attempt for `dueDate` (an IST calendar date string - the
// unique (sipPlanId, dueDate) index on fund_orders is what makes a retried
// Inngest step run never double-charge, D46). Unlike a manual order, a
// failure here IS persisted (`status: "failed"`, `failureReason` set) - a
// SIP runs unattended, so a persisted row is the only way the learner ever
// finds out it didn't execute (a deliberate, narrow exception to D41's
// "never persist a rejection" rule for interactive orders). The plan
// itself is never touched (paused/cancelled) by a failure - it simply
// tries again on its next due date, the same way a real bounced auto-debit
// mandate behaves.
export async function executeSipDueTx(
  plan: { id: string; userId: string; fundId: string; amountPaise: number },
  dueDate: string,
  now: Date = new Date(),
): Promise<SipDueResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${users} where id = ${plan.userId} for update`);

    const [existing] = await tx
      .select()
      .from(fundOrders)
      .where(and(eq(fundOrders.sipPlanId, plan.id), eq(fundOrders.dueDate, dueDate)))
      .limit(1);
    if (existing) return { status: "already_executed" };

    const nav = await getLatestNav(plan.fundId, tx);
    if (!nav) return { status: "nav_unavailable" };
    const todayIst = istDateString(now);
    if (daysBetweenIstDates(nav.date, todayIst) > NAV_STALE_DAYS) return { status: "nav_stale" };

    const balancePaise = await sumVmoneyBalanceTx(tx, plan.userId);
    if (balancePaise < plan.amountPaise) {
      const [failedOrder] = await tx
        .insert(fundOrders)
        .values({
          userId: plan.userId,
          fundId: plan.fundId,
          side: "buy",
          status: "failed",
          sipPlanId: plan.id,
          dueDate,
          failureReason: "INSUFFICIENT_MARGIN",
        })
        .returning();
      return { status: "failed_recorded", order: failedOrder! };
    }

    const unitsMilli = Math.round((plan.amountPaise * 1000) / nav.navPaise);
    const { realizedPnlPaise } = await applyFillToFundHoldingTx(tx, plan.userId, plan.fundId, "buy", unitsMilli, nav.navPaise);

    const [order] = await tx
      .insert(fundOrders)
      .values({
        userId: plan.userId,
        fundId: plan.fundId,
        side: "buy",
        status: "filled",
        amountPaise: plan.amountPaise,
        unitsMilli,
        navPaise: nav.navPaise,
        navDate: nav.date,
        realizedPnlPaise,
        sipPlanId: plan.id,
        dueDate,
      })
      .returning();

    await insertVmoneyLedgerEntryIfNew(tx, {
      userId: plan.userId,
      sourceType: "fund_trade",
      sourceId: order!.id,
      ruleId: null,
      reason: `SIP BUY fund units @ NAV ${nav.navPaise} (${nav.date})`,
      amountPaise: -plan.amountPaise,
      multiplierApplied: 1,
    });

    return { status: "filled", order: order! };
  });
}

// Every active SIP plan whose dayOfMonth matches `dayOfMonth` (1-28) -
// what the daily SIP-execution job fans out over. A plan restricted to
// 1-28 is due on every calendar month's matching day with zero month-
// length special-casing anywhere else (D45).
export async function listActiveSipPlansDueOn(dayOfMonth: number) {
  return db
    .select({ id: sipPlans.id, userId: sipPlans.userId, fundId: sipPlans.fundId, amountPaise: sipPlans.amountPaise })
    .from(sipPlans)
    .where(and(eq(sipPlans.status, "active"), eq(sipPlans.dayOfMonth, dayOfMonth)))
    .orderBy(asc(sipPlans.id));
}
