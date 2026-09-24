import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import type { requestMeta } from "@/lib/http";
import { decodeCursor } from "@/lib/http";
import { istMonthStartUtc } from "@/lib/ist-date";
import { getSettingNumber, setSettingJson } from "@/lib/settings";
import { recordLearningActivity } from "@/server/streaks/service";
import {
  creditLessonCompletionRow,
  creditVmoneyRow,
  getRewardRule,
  listRewardRules,
  listVmoneyLedgerForUser,
  sumVmoneyBalance,
  sumVmoneyEarnedSince,
  sumVmoneyEarnedSinceBySource,
  sumVmoneySpentSince,
  updateRewardRule,
  type VmoneyLedgerCursor,
  type RewardActivityKind,
} from "./repo";
import {
  DEFAULT_VM_ISSUANCE_MULTIPLIER,
  VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY,
  type RewardRuleUpdateInput,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

// docs/ECONOMY.md's activity taxonomy differs from lessons.lessonKindEnum in
// exactly one place: "doubt_zone" (the lesson kind) is "ai_chat" (the
// economy/reward name) - see docs/ECONOMY.md's per-lesson-kind rewards
// table. Every other kind's name matches directly. story/doubt_zone don't
// go through quiz_attempts at all (Checkpoint 3's own completion endpoint
// calls this the same way once built), but the mapping lives here so every
// caller (quiz-attempts service now, the story/doubt_zone endpoint later)
// uses the same source of truth.
export function activityKindForLessonKind(lessonKind: string): RewardActivityKind {
  if (lessonKind === "doubt_zone") return "ai_chat";
  if (
    lessonKind === "video" ||
    lessonKind === "story" ||
    lessonKind === "role_play" ||
    lessonKind === "quiz" ||
    lessonKind === "boss_quiz"
  ) {
    return lessonKind;
  }
  throw new AppError("VALIDATION_FAILED", `No reward activity kind for lesson kind "${lessonKind}"`);
}

export async function getVmIssuanceMultiplier(): Promise<number> {
  return getSettingNumber(VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY, DEFAULT_VM_ISSUANCE_MULTIPLIER);
}

// Gated on economy.manage (super_admin only, like settings.manage) - changes
// the VM every learner earns from this moment on, so it gets the same
// narrow trust bar as Lesson Flow's scoring constants.
export async function updateVmIssuanceMultiplier(
  actor: { id: string },
  value: number,
  meta: RequestMeta,
): Promise<number> {
  const previous = await getVmIssuanceMultiplier();
  await setSettingJson(
    VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY,
    value,
    "Global V Money issuance multiplier - scales every reward_rules VM award at credit time. " +
      "See docs/PRODUCT_SPEC.md §2.",
  );
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "economy.vm_multiplier_updated",
    targetType: "settings_kv",
    targetId: VM_ISSUANCE_MULTIPLIER_SETTINGS_KEY,
    metadata: { previous, next: value },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return value;
}

export async function listRewardRulesForAdmin() {
  return listRewardRules();
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// WH-03's V Money tile.
export async function getVmoneyStats(userId: string, at: Date = new Date()) {
  const since = new Date(at.getTime() - SEVEN_DAYS_MS);
  const [balance, weeklyEarned, weeklySpent] = await Promise.all([
    sumVmoneyBalance(userId),
    sumVmoneyEarnedSince(userId, since),
    sumVmoneySpentSince(userId, since),
  ]);
  return { balance, weeklyEarned, weeklySpent };
}

export async function updateRewardRuleForAdmin(
  actor: { id: string },
  activityKind: RewardActivityKind,
  input: RewardRuleUpdateInput,
  meta: RequestMeta,
) {
  const previous = await getRewardRule(activityKind);
  if (!previous) throw new AppError("NOT_FOUND", `No reward rule for activity kind "${activityKind}"`);

  const updated = await updateRewardRule(activityKind, input);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "economy.reward_rule_updated",
    targetType: "reward_rules",
    targetId: activityKind,
    metadata: {
      previous: { defaultXp: previous.defaultXp, defaultVm: previous.defaultVm, active: previous.active },
      next: input,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

// The one entry point every "did a learner just finish something rewardable"
// call site uses (today: quiz-attempts service's attempt-completion path;
// Checkpoint 3 adds the story/doubt_zone completion endpoint). Credits
// nothing when `successful` is false (docs/ECONOMY.md's per-lesson-kind
// "successful completion" rule - e.g. a completed-but-failed Boss Quiz
// attempt) - the learner can simply retry, and the NEXT successful attempt
// is what credits, since idempotency is keyed on (user, lesson), never on a
// specific attempt (docs/DATA_MODEL.md, the money-ledger skill). Silently
// no-ops (not an error) if this lesson has no active reward_rules row -
// crediting must never block a learner's completion because of a content/
// ops gap; it's just nothing to credit.
export async function creditLessonCompletion(
  user: { id: string },
  lesson: { id: string; kind: string; xpOverride: number | null; vmOverride: number | null },
  successful: boolean,
  meta: RequestMeta,
): Promise<{ credited: boolean }> {
  if (!successful) return { credited: false };

  const activityKind = activityKindForLessonKind(lesson.kind);
  const rule = await getRewardRule(activityKind);
  if (!rule || !rule.active) return { credited: false };

  const xpAmount = lesson.xpOverride ?? rule.defaultXp;
  const vmBaseAmount = lesson.vmOverride ?? rule.defaultVm;
  const multiplier = await getVmIssuanceMultiplier();
  const vmAmount = Math.round(vmBaseAmount * multiplier);

  const shared = {
    userId: user.id,
    sourceType: "lesson_completion",
    sourceId: lesson.id,
    ruleId: rule.id,
    reason: `Lesson completed (${activityKind})`,
  };
  const { xpRow, vmRow } = await creditLessonCompletionRow(
    { ...shared, amount: xpAmount },
    { ...shared, amount: vmAmount, multiplierApplied: multiplier },
  );

  // Both inserts share the same (userId, sourceType, sourceId) idempotency
  // key, so they always both hit or both conflict together - this is just a
  // sanity guard against that assumption ever drifting, not a real branch
  // expected to fire.
  const credited = xpRow !== null && vmRow !== null;
  if (credited) {
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "economy.lesson_credited",
      targetType: "lesson",
      targetId: lesson.id,
      metadata: { activityKind, xpAmount, vmAmount, multiplierApplied: multiplier, ruleId: rule.id },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    // docs/ECONOMY.md decision 5: a real, first-time credit is exactly what
    // "activity" means for the learning streak - a replay or a below-pass-
    // mark attempt never reaches this branch at all.
    await recordLearningActivity(user.id);
  }
  return { credited };
}

// Generic VM-only credit, used by badge unlocks (src/server/badges/service.ts)
// and reward refunds (src/server/rewards/service.ts) - the global VM
// issuance multiplier applies here exactly like every other credit path
// (creditLessonCompletion above), and `multiplierApplied` is stamped on the
// row so the balance stays explainable even after the multiplier later
// changes (same reasoning as docs/ARCHITECTURE.md D26).
export async function creditVmoney(input: {
  userId: string;
  sourceType: string;
  sourceId: string;
  baseAmount: number;
  reason: string;
}): Promise<{ credited: boolean; amount: number }> {
  const multiplier = await getVmIssuanceMultiplier();
  const amount = Math.round(input.baseAmount * multiplier);
  const row = await creditVmoneyRow({
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    ruleId: null,
    reason: input.reason,
    amount,
    multiplierApplied: multiplier,
  });
  return { credited: row !== null, amount };
}

// PR-21 (Profile - Wallet): balance, VM earned this (IST) calendar month,
// and an earn-source breakdown - see sumVmoneyEarnedSinceBySource's comment
// on why the breakdown only ever shows sourceTypes that actually exist yet.
export async function getMyWallet(userId: string, at: Date = new Date()) {
  const monthStart = istMonthStartUtc(at);
  const [balance, earnedThisMonth, earnedBySource] = await Promise.all([
    sumVmoneyBalance(userId),
    sumVmoneyEarnedSince(userId, monthStart),
    sumVmoneyEarnedSinceBySource(userId, monthStart),
  ]);
  return { balance, earnedThisMonth, earnedBySource };
}

// PR-24 (Profile - Wallet): the caller's full ledger history, newest first.
export async function getMyWalletHistory(userId: string, opts: { limit: number; cursor: string | null }) {
  const cursor = decodeCursor<VmoneyLedgerCursor>(opts.cursor);
  return listVmoneyLedgerForUser(userId, { limit: opts.limit, cursor });
}
