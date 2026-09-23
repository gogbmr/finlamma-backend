import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  rewardActivityKindEnum,
  rewardRules,
  vmoneyLedger,
  xpEvents,
} from "@/db/schema";

export type RewardActivityKind = (typeof rewardActivityKindEnum.enumValues)[number];

export async function getRewardRule(activityKind: RewardActivityKind) {
  const [row] = await db
    .select()
    .from(rewardRules)
    .where(eq(rewardRules.activityKind, activityKind))
    .limit(1);
  return row ?? null;
}

export async function listRewardRules() {
  return db.select().from(rewardRules).orderBy(rewardRules.activityKind);
}

export async function updateRewardRule(
  activityKind: RewardActivityKind,
  input: { defaultXp: number; defaultVm: number; active: boolean },
) {
  const [row] = await db
    .update(rewardRules)
    .set(input)
    .where(eq(rewardRules.activityKind, activityKind))
    .returning();
  return row ?? null;
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type CreditInput = {
  userId: string;
  sourceType: string;
  sourceId: string;
  // Null for a non-rule-based entry - a reversal, or a future manual admin
  // adjustment.
  ruleId: string | null;
  reason: string;
};

// Both inserts rely on the (userId, sourceType, sourceId) unique index for
// idempotency (docs/DATA_MODEL.md, the money-ledger skill) - a conflict
// means this exact credit was already recorded, so onConflictDoNothing
// silently no-ops rather than erroring. .returning() comes back empty on a
// conflict, which is how the caller tells "this credited for real" apart
// from "already credited, nothing to do".
async function insertXpEventIfNew(txDb: DbOrTx, input: CreditInput & { amount: number }) {
  const [row] = await txDb
    .insert(xpEvents)
    .values(input)
    .onConflictDoNothing({ target: [xpEvents.userId, xpEvents.sourceType, xpEvents.sourceId] })
    .returning();
  return row ?? null;
}

async function insertVmoneyLedgerEntryIfNew(
  txDb: DbOrTx,
  input: CreditInput & { amount: number; multiplierApplied: number },
) {
  const [row] = await txDb
    .insert(vmoneyLedger)
    .values(input)
    .onConflictDoNothing({
      target: [vmoneyLedger.userId, vmoneyLedger.sourceType, vmoneyLedger.sourceId],
    })
    .returning();
  return row ?? null;
}

// Wraps both inserts in one transaction (new-endpoint skill: "wrap
// multi-table writes in a transaction") so a lesson's XP and VM credit are
// all-or-nothing - never a half-credited state if one insert somehow failed
// after the other succeeded.
export async function creditLessonCompletionRow(
  xp: CreditInput & { amount: number },
  vm: CreditInput & { amount: number; multiplierApplied: number },
) {
  return db.transaction(async (tx) => {
    const xpRow = await insertXpEventIfNew(tx, xp);
    const vmRow = await insertVmoneyLedgerEntryIfNew(tx, vm);
    return { xpRow, vmRow };
  });
}

// Postgres's SUM() over an integer/bigint column returns `numeric`, which
// the driver can hand back as a string - Number(...) below normalizes
// either shape. Safe for V Money at any balance we'll realistically ever
// see (well under Number.MAX_SAFE_INTEGER), same as every other place in
// this codebase that treats a bigint({mode:"number"}) column as a plain
// number.
function toNumber(value: string | number | null): number {
  return Number(value ?? 0);
}

// Never a stored balance column (CLAUDE.md rule 2) - always summed live
// from the append-only ledger. There is no spend path yet in this phase, so
// this is currently always >= 0 in practice, but nothing here assumes that.
export async function sumXpTotal(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId));
  return toNumber(row?.total ?? 0);
}

export async function sumXpSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), gte(xpEvents.createdAt, since)));
  return toNumber(row?.total ?? 0);
}

export async function sumVmoneyBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | number>`coalesce(sum(${vmoneyLedger.amount}), 0)` })
    .from(vmoneyLedger)
    .where(eq(vmoneyLedger.userId, userId));
  return toNumber(row?.total ?? 0);
}

// Split into earned/spent (rather than one signed delta) for the WH-03 V
// Money tile, which shows both separately. There's no spend path yet in
// this phase (trading is Phase 4+), so weeklySpent is always 0 today - that
// will change automatically once something inserts a negative-amount row.
export async function sumVmoneyEarnedSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string | number>`coalesce(sum(${vmoneyLedger.amount}) filter (where ${vmoneyLedger.amount} > 0), 0)`,
    })
    .from(vmoneyLedger)
    .where(and(eq(vmoneyLedger.userId, userId), gte(vmoneyLedger.createdAt, since)));
  return toNumber(row?.total ?? 0);
}

export async function sumVmoneySpentSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string | number>`coalesce(-sum(${vmoneyLedger.amount}) filter (where ${vmoneyLedger.amount} < 0), 0)`,
    })
    .from(vmoneyLedger)
    .where(and(eq(vmoneyLedger.userId, userId), gte(vmoneyLedger.createdAt, since)));
  return toNumber(row?.total ?? 0);
}
