import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { fundOrders, sipPlans } from "@/db/schema";

export type SipPlanRow = typeof sipPlans.$inferSelect;

// Idempotency-Key (Phase 4 Trade asks) - insert-and-treat-conflict-as-
// already-handled, same shape as every other idempotent write in this
// codebase (orders.idempotencyKey, D26/D41). Returns null on a conflict
// (this exact key was already used by this user) - the caller
// (src/server/fund-orders/sip-service.ts's createSip) then looks up the
// existing plan via getSipPlanByIdempotencyKey to decide replay vs.
// IDEMPOTENCY_REPLAY.
export async function createSipPlan(
  userId: string,
  fundId: string,
  amountPaise: number,
  dayOfMonth: number,
  idempotencyKey: string,
) {
  const [row] = await db
    .insert(sipPlans)
    .values({ userId, fundId, amountPaise, dayOfMonth, idempotencyKey })
    .onConflictDoNothing({ target: [sipPlans.userId, sipPlans.idempotencyKey] })
    .returning();
  return row ?? null;
}

export async function getSipPlanByIdempotencyKey(userId: string, idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(sipPlans)
    .where(and(eq(sipPlans.userId, userId), eq(sipPlans.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ?? null;
}

export async function getSipPlanForUser(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(sipPlans)
    .where(and(eq(sipPlans.id, id), eq(sipPlans.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listSipPlansForUser(userId: string) {
  return db.select().from(sipPlans).where(eq(sipPlans.userId, userId)).orderBy(desc(sipPlans.createdAt));
}

// Reversible - a paused plan is simply excluded from the daily execution
// job's due-today query (src/server/fund-orders/repo.ts's
// listActiveSipPlansDueOn); no failed row is ever recorded for a month the
// learner deliberately chose to skip.
export async function pauseSipPlan(id: string, userId: string, now: Date = new Date()) {
  const [row] = await db
    .update(sipPlans)
    .set({ status: "paused", pausedAt: now })
    .where(and(eq(sipPlans.id, id), eq(sipPlans.userId, userId), eq(sipPlans.status, "active")))
    .returning();
  return row ?? null;
}

export async function resumeSipPlan(id: string, userId: string) {
  const [row] = await db
    .update(sipPlans)
    .set({ status: "active", pausedAt: null })
    .where(and(eq(sipPlans.id, id), eq(sipPlans.userId, userId), eq(sipPlans.status, "paused")))
    .returning();
  return row ?? null;
}

// Terminal - a cancelled plan can never be resumed, only replaced with a
// new one (founder's Checkpoint 8 answer on pause vs. cancel semantics).
export async function cancelSipPlan(id: string, userId: string, now: Date = new Date()) {
  const [row] = await db
    .update(sipPlans)
    .set({ status: "cancelled", cancelledAt: now })
    .where(and(eq(sipPlans.id, id), eq(sipPlans.userId, userId), ne(sipPlans.status, "cancelled")))
    .returning();
  return row ?? null;
}

export async function listRecentFundOrdersForSipPlan(sipPlanId: string, limit: number) {
  return db
    .select()
    .from(fundOrders)
    .where(eq(fundOrders.sipPlanId, sipPlanId))
    .orderBy(desc(fundOrders.createdAt))
    .limit(limit);
}
