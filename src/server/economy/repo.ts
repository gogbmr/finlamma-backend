import { eq } from "drizzle-orm";
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
