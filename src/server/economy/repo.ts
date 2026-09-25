import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  rewardActivityKindEnum,
  rewardRules,
  vmoneyLedger,
  xpEvents,
} from "@/db/schema";
import { encodeCursor } from "@/lib/http";

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

export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

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

// D37 (docs/ARCHITECTURE.md): `amountPaise` is the ledger's real unit from
// here on - exact paise, pegged 1:1 with rupees (100 = 1 V Money), so a
// trade's cost/proceeds need zero rounding at the point they're written.
// `amount` (the old whole-VM column) is intentionally never written by this
// function - see economy.ts schema's comment for why it stays nullable
// rather than being dropped yet.
export async function insertVmoneyLedgerEntryIfNew(
  txDb: DbOrTx,
  input: CreditInput & { amountPaise: number; multiplierApplied: number },
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
  vm: CreditInput & { amountPaise: number; multiplierApplied: number },
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

// Generic, non-lesson VM-only credit, standalone (not part of a larger
// transaction) - reward refunds (src/server/rewards/service.ts) use this
// rather than reaching for creditLessonCompletionRow, which always bundles
// an XP row too. Badge unlocks need their award + credit to commit
// atomically together, so they use insertVmoneyLedgerEntryIfNew directly
// inside their own transaction instead (src/server/badges/repo.ts's
// awardBadgeAndCreditVmoney). Same (userId, sourceType, sourceId)
// idempotency mechanism as every other ledger write (D26).
export async function creditVmoneyRow(
  input: CreditInput & { amountPaise: number; multiplierApplied: number },
) {
  return insertVmoneyLedgerEntryIfNew(db, input);
}

// Same as sumVmoneyBalance below, but runs against a caller-supplied
// transaction handle - src/server/rewards/service.ts's claimReward reads
// this AFTER locking the user's row (lockUserRowForUpdate) and BEFORE
// inserting the debit, all inside one transaction, so the balance it sees
// can never be stale relative to a concurrent claim on the same user.
export async function sumVmoneyBalanceTx(txDb: DbOrTx, userId: string): Promise<number> {
  const [row] = await txDb
    .select({ total: sql<string | number>`coalesce(sum(${vmoneyLedger.amountPaise}), 0)` })
    .from(vmoneyLedger)
    .where(eq(vmoneyLedger.userId, userId));
  return toNumber(row?.total ?? 0);
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
    .select({ total: sql<string | number>`coalesce(sum(${vmoneyLedger.amountPaise}), 0)` })
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
      total: sql<string | number>`coalesce(sum(${vmoneyLedger.amountPaise}) filter (where ${vmoneyLedger.amountPaise} > 0), 0)`,
    })
    .from(vmoneyLedger)
    .where(and(eq(vmoneyLedger.userId, userId), gte(vmoneyLedger.createdAt, since)));
  return toNumber(row?.total ?? 0);
}

// PR-21 (Profile - Wallet): earn-source breakdown, grouped by whatever
// sourceType values actually exist in the ledger right now (today, only
// "lesson_completion" - the breakdown grows on its own as Phase 4/5/6 add
// new source types like "trade"/"pulse_check"/"cheer", no code change here).
export async function sumVmoneyEarnedSinceBySource(
  userId: string,
  since: Date,
): Promise<{ sourceType: string; amountPaise: number }[]> {
  const rows = await db
    .select({
      sourceType: vmoneyLedger.sourceType,
      total: sql<string | number>`coalesce(sum(${vmoneyLedger.amountPaise}), 0)`,
    })
    .from(vmoneyLedger)
    .where(
      and(
        eq(vmoneyLedger.userId, userId),
        gte(vmoneyLedger.createdAt, since),
        sql`${vmoneyLedger.amountPaise} > 0`,
      ),
    )
    .groupBy(vmoneyLedger.sourceType);
  return rows.map((r) => ({ sourceType: r.sourceType, amountPaise: toNumber(r.total) }));
}

export async function sumVmoneySpentSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string | number>`coalesce(-sum(${vmoneyLedger.amountPaise}) filter (where ${vmoneyLedger.amountPaise} < 0), 0)`,
    })
    .from(vmoneyLedger)
    .where(and(eq(vmoneyLedger.userId, userId), gte(vmoneyLedger.createdAt, since)));
  return toNumber(row?.total ?? 0);
}

export type VmoneyLedgerCursor = { createdAt: string; id: string };

// PR-24 (Profile - Rewards): the caller's own full ledger history, newest
// first - same (createdAt, id) stable-cursor pattern as
// src/lib/activity-log.ts's listActivityLogs, for the same reason (a shared
// createdAt timestamp between two rows must never skip or repeat a page).
export async function listVmoneyLedgerForUser(
  userId: string,
  opts: { limit: number; cursor: VmoneyLedgerCursor | null },
) {
  const conditions = [eq(vmoneyLedger.userId, userId)];
  if (opts.cursor) {
    const cursorCreatedAt = new Date(opts.cursor.createdAt);
    conditions.push(
      or(
        lt(vmoneyLedger.createdAt, cursorCreatedAt),
        and(eq(vmoneyLedger.createdAt, cursorCreatedAt), lt(vmoneyLedger.id, opts.cursor.id)),
      )!,
    );
  }

  // Explicit column list (not select()) - deliberately never exposes the
  // deprecated `amount` column (D37, stale/null depending on when the row
  // was written) or internal fields (userId, sourceId, ruleId,
  // multiplierApplied) the API response was never documented to include.
  const rows = await db
    .select({
      id: vmoneyLedger.id,
      amountPaise: vmoneyLedger.amountPaise,
      sourceType: vmoneyLedger.sourceType,
      reason: vmoneyLedger.reason,
      createdAt: vmoneyLedger.createdAt,
    })
    .from(vmoneyLedger)
    .where(and(...conditions))
    .orderBy(desc(vmoneyLedger.createdAt), desc(vmoneyLedger.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id } satisfies VmoneyLedgerCursor)
      : null;

  return { data: page, nextCursor };
}
