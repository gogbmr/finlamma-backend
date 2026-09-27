import { logActivity } from "@/lib/activity-log";
import { AppError } from "@/lib/errors";
import { logInternalError } from "@/lib/http";
import type { requestMeta } from "@/lib/http";
import { VM_TO_LEDGER_PAISE } from "@/server/economy/schemas";
import { getVmIssuanceMultiplier } from "@/server/economy/service";
import type { LocalizedText } from "@/server/shared/schemas";
import { BADGE_CRITERIA_EVALUATORS } from "./evaluators";
import {
  awardBadgeAndCreditVmoney,
  getBadgeById,
  insertDraftBadge,
  listAllBadges,
  listPublishedBadges,
  listUnlockedBadgeIdsForUser,
  listUserBadgesForUser,
  publishBadgeRow,
  unpublishBadgeRow,
  updateDraftBadge,
} from "./repo";
import type { CreateBadgeDraftInput, UpdateBadgeDraftInput } from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;
type BadgeRow = NonNullable<Awaited<ReturnType<typeof getBadgeById>>>;

// Publish is blocked until every trilingual text leaf has en/hi/hx all
// filled - same pattern as mentors/worlds/questions.
function validateBadgeForPublish(badge: BadgeRow): void {
  const missing: string[] = [];
  const checkLocalized = (fieldName: string, value: LocalizedText) => {
    for (const lang of ["en", "hi", "hx"] as const) {
      if (!value[lang]?.trim()) missing.push(`${fieldName}.${lang}`);
    }
  };
  checkLocalized("name", badge.name);
  checkLocalized("description", badge.description);

  if (missing.length > 0) {
    throw new AppError("VALIDATION_FAILED", `Cannot publish: missing ${missing.join(", ")}`, {
      missingFields: missing,
    });
  }
}

export async function getBadgeEditorData() {
  return listAllBadges();
}

export async function createBadgeDraft(actor: { id: string }, input: CreateBadgeDraftInput, meta: RequestMeta) {
  const created = await insertDraftBadge(input);
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "badge.created",
    targetType: "badge",
    targetId: created.id,
    metadata: { name: created.name.en, criteria: created.criteria, vmReward: created.vmReward },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateBadgeDraft(actor: { id: string }, input: UpdateBadgeDraftInput, meta: RequestMeta) {
  const updated = await updateDraftBadge(input);
  if (!updated) throw new AppError("NOT_FOUND", "Badge not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "badge.draft_saved",
    targetType: "badge",
    targetId: updated.id,
    metadata: { name: updated.name.en, criteria: updated.criteria, vmReward: updated.vmReward },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

export async function publishBadge(actor: { id: string }, id: string, meta: RequestMeta) {
  const badge = await getBadgeById(id);
  if (!badge) throw new AppError("NOT_FOUND", "Badge not found");
  if (badge.status !== "draft") throw new AppError("CONFLICT", "Badge is not a draft");
  validateBadgeForPublish(badge);

  const published = await publishBadgeRow(id, actor.id);
  if (!published) throw new AppError("CONFLICT", "Badge is not a draft");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "badge.published",
    targetType: "badge",
    targetId: published.id,
    metadata: { name: published.name.en },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return published;
}

export async function unpublishBadge(actor: { id: string }, id: string, meta: RequestMeta) {
  const unpublished = await unpublishBadgeRow(id);
  if (!unpublished) throw new AppError("CONFLICT", "Badge not found, or it's not published");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "badge.unpublished",
    targetType: "badge",
    targetId: unpublished.id,
    metadata: { name: unpublished.name.en },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return unpublished;
}

// The one entry point that decides "does this user now qualify for any
// badge they don't already have". Idempotent by construction:
// awardBadgeAndCreditVmoney's unique constraint means re-running this for a
// user who already holds a badge is always a silent no-op for that badge,
// never a second award or a second VM credit - and the award + the VM
// credit commit together in one transaction (a security audit found these
// were previously two separate writes, so a credit failure after a
// successful award could permanently strand a badge with no VM ever paid,
// see src/server/badges/repo.ts's comment). Never throws for a single
// badge's own evaluation failure - one bad criteria/evaluator must not stop
// every other badge from being checked; the caller
// (src/server/quiz-attempts/service.ts) also wraps the whole call so this
// can never break lesson crediting.
export async function evaluateBadgesForUser(user: { id: string }, meta: RequestMeta) {
  const [published, unlockedIds] = await Promise.all([
    listPublishedBadges(),
    listUnlockedBadgeIdsForUser(user.id),
  ]);
  const locked = published.filter((b) => !unlockedIds.has(b.id));

  const newlyUnlocked: BadgeRow[] = [];
  for (const badge of locked) {
    try {
      const evaluator = BADGE_CRITERIA_EVALUATORS[badge.criteria.type as keyof typeof BADGE_CRITERIA_EVALUATORS];
      if (!evaluator) continue;
      const progress = await evaluator(user.id);
      if (progress < badge.criteria.threshold) continue;

      const multiplier = await getVmIssuanceMultiplier();
      // D37: rounds at paise scale, not whole-VM scale - see
      // src/server/economy/service.ts's creditLessonCompletion comment.
      const amountPaise = Math.round(badge.vmReward * VM_TO_LEDGER_PAISE * multiplier);
      const result = await awardBadgeAndCreditVmoney(user.id, badge.id, {
        sourceType: "badge_unlock",
        sourceId: badge.id,
        ruleId: null,
        reason: `Badge unlocked: ${badge.name.en}`,
        amountPaise,
        multiplierApplied: multiplier,
      });
      if (!result) continue; // lost a race - another concurrent call already awarded it

      await logActivity({
        actorType: "user",
        actorId: user.id,
        action: "badge.unlocked",
        targetType: "badge",
        targetId: badge.id,
        metadata: { name: badge.name.en, vmAwardedPaise: amountPaise },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      newlyUnlocked.push(badge);
    } catch (err) {
      logInternalError("badges.evaluate_failed", err);
    }
  }
  return newlyUnlocked;
}

// PR-16/17/18/19/20: every published badge, with the caller's own progress
// and unlock state - locked badges show real progress (not just 0), so the
// app can render "7/10" rings.
export async function getMyBadges(userId: string) {
  const [published, userBadgeRows] = await Promise.all([
    listPublishedBadges(),
    listUserBadgesForUser(userId),
  ]);
  const unlockedByBadgeId = new Map(userBadgeRows.map((r) => [r.badgeId, r.createdAt]));

  return Promise.all(
    published.map(async (badge) => {
      const unlockedAt = unlockedByBadgeId.get(badge.id) ?? null;
      const evaluator = BADGE_CRITERIA_EVALUATORS[badge.criteria.type as keyof typeof BADGE_CRITERIA_EVALUATORS];
      const progress = unlockedAt ? badge.criteria.threshold : evaluator ? await evaluator(userId) : 0;
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        category: badge.category,
        vmReward: badge.vmReward,
        iconKey: badge.iconKey,
        target: badge.criteria.threshold,
        progress: Math.min(progress, badge.criteria.threshold),
        unlocked: unlockedAt !== null,
        unlockedAt,
      };
    }),
  );
}
