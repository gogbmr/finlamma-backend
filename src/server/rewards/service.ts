import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { checkRateLimit, REWARD_CLAIM_RATE_LIMIT } from "@/lib/redis";
import { creditVmoneyRow } from "@/server/economy/repo";
import { VM_TO_LEDGER_PAISE } from "@/server/economy/schemas";
import type { LocalizedText } from "@/server/shared/schemas";
import {
  claimRewardTx,
  getRewardById,
  getRewardClaimById,
  insertDraftReward,
  listAllRewards,
  listPublishedRewards,
  listRewardClaimsForUser,
  listRecentRewardClaims,
  publishRewardRow,
  unpublishRewardRow,
  updateDraftReward,
} from "./repo";
import type { CreateRewardDraftInput, UpdateRewardDraftInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type RewardRow = NonNullable<Awaited<ReturnType<typeof getRewardById>>>;

function validateRewardForPublish(reward: RewardRow): void {
  const missing: string[] = [];
  const checkLocalized = (fieldName: string, value: LocalizedText) => {
    for (const lang of ["en", "hi", "hx"] as const) {
      if (!value[lang]?.trim()) missing.push(`${fieldName}.${lang}`);
    }
  };
  checkLocalized("name", reward.name);
  checkLocalized("description", reward.description);

  if (missing.length > 0) {
    throw new AppError("VALIDATION_FAILED", `Cannot publish: missing ${missing.join(", ")}`, {
      missingFields: missing,
    });
  }
}

export async function getRewardEditorData() {
  return listAllRewards();
}

export async function createRewardDraft(actor: { id: string }, input: CreateRewardDraftInput, meta: RequestMeta) {
  const created = await insertDraftReward(input);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "reward.created",
    targetType: "reward",
    targetId: created.id,
    metadata: { name: created.name.en, category: created.category, priceVm: created.priceVm },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateRewardDraft(actor: { id: string }, input: UpdateRewardDraftInput, meta: RequestMeta) {
  const updated = await updateDraftReward(input);
  if (!updated) throw new AppError("NOT_FOUND", "Reward not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "reward.draft_saved",
    targetType: "reward",
    targetId: updated.id,
    metadata: { name: updated.name.en, priceVm: updated.priceVm },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function publishReward(actor: { id: string }, id: string, meta: RequestMeta) {
  const reward = await getRewardById(id);
  if (!reward) throw new AppError("NOT_FOUND", "Reward not found");
  if (reward.status !== "draft") throw new AppError("CONFLICT", "Reward is not a draft");
  validateRewardForPublish(reward);

  const published = await publishRewardRow(id, actor.id);
  if (!published) throw new AppError("CONFLICT", "Reward is not a draft");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "reward.published",
    targetType: "reward",
    targetId: published.id,
    metadata: { name: published.name.en },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return published;
}

export async function unpublishReward(actor: { id: string }, id: string, meta: RequestMeta) {
  const unpublished = await unpublishRewardRow(id);
  if (!unpublished) throw new AppError("CONFLICT", "Reward not found, or it's not published");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "reward.unpublished",
    targetType: "reward",
    targetId: unpublished.id,
    metadata: { name: unpublished.name.en },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return unpublished;
}

// PR-21/22/23
export async function getMyRewards(userId: string) {
  const [published, claims] = await Promise.all([listPublishedRewards(), listRewardClaimsForUser(userId)]);
  const claimedRewardIds = new Set(claims.map((c) => c.rewardId));
  return published.map((reward) => ({
    id: reward.id,
    name: reward.name,
    description: reward.description,
    category: reward.category,
    priceVm: reward.priceVm,
    iconKey: reward.iconKey,
    claimed: claimedRewardIds.has(reward.id),
  }));
}

// PR-22: claims a reward, once, ever, per learner (decided - see
// src/db/schema/rewards.ts's comment). Fails CLOSED on a Redis outage
// (failOpen: false) - this is a money-spending endpoint, so refusing when
// the rate limit genuinely can't be checked is the safe default, the
// opposite of the learning endpoints' failOpen: true (src/lib/redis.ts).
export async function claimReward(user: { id: string }, rewardId: string, meta: RequestMeta) {
  const { allowed } = await checkRateLimit(user.id, REWARD_CLAIM_RATE_LIMIT, false);
  if (!allowed) {
    throw new AppError("RATE_LIMITED", "Too many claim attempts - slow down and try again shortly");
  }

  const reward = await getRewardById(rewardId);
  if (!reward || reward.status !== "published") {
    throw new AppError("NOT_FOUND", "No published reward with this id");
  }

  const result = await claimRewardTx({ userId: user.id, rewardId, priceVm: reward.priceVm });
  if (result.status === "insufficient_balance") {
    // D37: the ledger is exact paise, but a reward's price and the message
    // shown to the learner are whole VM - floor (never round up) so the
    // displayed balance never overstates what they can actually afford.
    const balanceVm = Math.floor(result.balancePaise / VM_TO_LEDGER_PAISE);
    throw new AppError(
      "INSUFFICIENT_VMONEY",
      `Not enough V Money - this costs ${reward.priceVm}, you have ${balanceVm}`,
      { priceVm: reward.priceVm, balanceVm, balancePaise: result.balancePaise },
    );
  }

  if (result.status === "claimed") {
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "reward.claimed",
      targetType: "reward",
      targetId: rewardId,
      metadata: { name: reward.name.en, pricePaid: result.claim.pricePaid },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return {
    rewardId,
    pricePaid: result.claim.pricePaid,
    alreadyClaimed: result.status === "already_claimed",
    claimedAt: result.claim.createdAt,
  };
}

// Admin-only (economy.manage), same trust bar as every other VM-moving admin
// action. Credits the exact amount originally paid, at multiplier 1 - a
// refund is an exact reversal of a specific past debit, never scaled by
// whatever the VM issuance multiplier happens to be today (that multiplier
// is only for fresh issuance, see src/server/economy/service.ts's
// creditVmoney). Idempotent: sourceType "reward_refund" + sourceId
// claim.id can never be credited twice for the same claim (same unique
// constraint every other ledger write relies on) - a second refund attempt
// on an already-refunded claim is a silent no-op, not a double payout.
export async function refundRewardClaim(
  actor: { id: string },
  claimId: string,
  reason: string,
  meta: RequestMeta,
) {
  const claim = await getRewardClaimById(claimId);
  if (!claim) throw new AppError("NOT_FOUND", "Claim not found");

  const row = await creditVmoneyRow({
    userId: claim.userId,
    sourceType: "reward_refund",
    sourceId: claim.id,
    ruleId: null,
    reason,
    // claim.pricePaid is a whole-VM snapshot (rewards.priceVm at claim time,
    // unchanged by D37) - convert to the ledger's paise unit here, the only
    // place this refund amount is used.
    amountPaise: claim.pricePaid * VM_TO_LEDGER_PAISE,
    multiplierApplied: 1,
  });
  const refunded = row !== null;

  if (refunded) {
    await logActivity({
      actorType: "staff",
      actorId: actor.id,
      action: "reward.refunded",
      targetType: "reward_claim",
      targetId: claim.id,
      metadata: { userId: claim.userId, rewardId: claim.rewardId, amount: claim.pricePaid, reason },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  return { refunded };
}

// Admin: the Reward Catalog's refund tool needs each claim's reward name
// to display, not just its id - joined in-memory (small N), same pattern
// src/server/certificates/service.ts's listMyCertificates already uses for
// joining a certificate with its world.
export async function listRecentClaimsForAdmin(limit = 50) {
  const claims = await listRecentRewardClaims(limit);
  const rewardIds = [...new Set(claims.map((c) => c.rewardId))];
  const rewards = await Promise.all(rewardIds.map((id) => getRewardById(id)));
  const rewardById = new Map(rewards.filter((r) => r !== null).map((r) => [r.id, r]));
  return claims.map((claim) => ({
    id: claim.id,
    userId: claim.userId,
    rewardId: claim.rewardId,
    rewardName: rewardById.get(claim.rewardId)?.name.en ?? "(unknown reward)",
    pricePaid: claim.pricePaid,
    claimedAt: claim.createdAt,
  }));
}
