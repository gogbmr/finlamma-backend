import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rewardClaims, rewards, users } from "@/db/schema";
import { insertVmoneyLedgerEntryIfNew, sumVmoneyBalanceTx } from "@/server/economy/repo";
import { VM_TO_LEDGER_PAISE } from "@/server/economy/schemas";
import type { CreateRewardDraftInput, UpdateRewardDraftInput } from "./schemas";

export async function listPublishedRewards() {
  return db.select().from(rewards).where(eq(rewards.status, "published")).orderBy(asc(rewards.createdAt));
}

export async function listAllRewards() {
  return db.select().from(rewards).orderBy(asc(rewards.createdAt));
}

export async function getRewardById(id: string) {
  const [row] = await db.select().from(rewards).where(eq(rewards.id, id)).limit(1);
  return row ?? null;
}

export async function insertDraftReward(input: CreateRewardDraftInput) {
  const [row] = await db.insert(rewards).values(input).returning();
  return row;
}

export async function updateDraftReward(input: UpdateRewardDraftInput) {
  const { id, ...rest } = input;
  const [row] = await db.update(rewards).set(rest).where(eq(rewards.id, id)).returning();
  return row ?? null;
}

export async function publishRewardRow(id: string, staffId: string) {
  const [row] = await db
    .update(rewards)
    .set({ status: "published", publishedAt: new Date(), publishedBy: staffId })
    .where(eq(rewards.id, id))
    .returning();
  return row ?? null;
}

export async function unpublishRewardRow(id: string) {
  const [row] = await db
    .update(rewards)
    .set({ status: "draft", publishedAt: null, publishedBy: null })
    .where(eq(rewards.id, id))
    .returning();
  return row ?? null;
}

export async function getRewardClaim(userId: string, rewardId: string) {
  const [row] = await db
    .select()
    .from(rewardClaims)
    .where(and(eq(rewardClaims.userId, userId), eq(rewardClaims.rewardId, rewardId)))
    .limit(1);
  return row ?? null;
}

export async function listRewardClaimsForUser(userId: string) {
  return db.select().from(rewardClaims).where(eq(rewardClaims.userId, userId));
}

export async function getRewardClaimById(id: string) {
  const [row] = await db.select().from(rewardClaims).where(eq(rewardClaims.id, id)).limit(1);
  return row ?? null;
}

// Admin: most recent claims across every reward/user, for the Reward
// Catalog's refund tool.
export async function listRecentRewardClaims(limit: number) {
  return db.select().from(rewardClaims).orderBy(sql`${rewardClaims.createdAt} desc`).limit(limit);
}

export type ClaimRewardResult =
  | { status: "already_claimed"; claim: typeof rewardClaims.$inferSelect }
  | { status: "insufficient_balance"; balancePaise: number }
  | { status: "claimed"; claim: typeof rewardClaims.$inferSelect };

// The whole claim, atomically: lock this user's row first (serializes every
// concurrent VM-spending operation for them - claims, and any future spend
// path, through one queue instead of a race), THEN check for an existing
// claim (idempotent - same reward can never be claimed twice), THEN check
// the live balance, THEN insert the claim and debit together. Locking
// BEFORE reading the balance is what makes "balance can never go negative"
// actually hold under concurrency: without the lock, two concurrent claims
// could both read a sufficient balance before either commits its debit
// (see docs/ARCHITECTURE.md D30's identical SELECT ... FOR UPDATE reasoning
// for streaks - same technique, applied here because vmoney_ledger has no
// stored balance row of its own to lock, only a derived SUM).
export async function claimRewardTx(input: {
  userId: string;
  rewardId: string;
  priceVm: number;
}): Promise<ClaimRewardResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${users} where id = ${input.userId} for update`);

    const [existing] = await tx
      .select()
      .from(rewardClaims)
      .where(and(eq(rewardClaims.userId, input.userId), eq(rewardClaims.rewardId, input.rewardId)))
      .limit(1);
    if (existing) return { status: "already_claimed", claim: existing };

    const balancePaise = await sumVmoneyBalanceTx(tx, input.userId);
    const priceVmPaise = input.priceVm * VM_TO_LEDGER_PAISE;
    if (balancePaise < priceVmPaise) return { status: "insufficient_balance", balancePaise };

    const [claim] = await tx
      .insert(rewardClaims)
      .values({ userId: input.userId, rewardId: input.rewardId, pricePaid: input.priceVm })
      .onConflictDoNothing({ target: [rewardClaims.userId, rewardClaims.rewardId] })
      .returning();
    if (!claim) {
      // Lost a race against a concurrent duplicate claim for this exact
      // reward, even under the row lock above (e.g. a retried request that
      // arrived a second time) - the lock is per-user, not per-request, so
      // this can't happen for two DIFFERENT users, only a genuine resubmit.
      const [winner] = await tx
        .select()
        .from(rewardClaims)
        .where(and(eq(rewardClaims.userId, input.userId), eq(rewardClaims.rewardId, input.rewardId)))
        .limit(1);
      return { status: "already_claimed", claim: winner! };
    }

    await insertVmoneyLedgerEntryIfNew(tx, {
      userId: input.userId,
      sourceType: "reward_claim",
      sourceId: claim.id,
      ruleId: null,
      reason: "Reward claimed",
      amountPaise: -priceVmPaise,
      multiplierApplied: 1,
    });

    return { status: "claimed", claim };
  });
}
