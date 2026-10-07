// Layer 2 of 2 of the dev/test seed dataset (layer 1:
// scripts/seed-dev-content.ts). Creates ~50 synthetic learner accounts with
// correlated activity across every user-facing table, on top of the
// published placeholder content layer 1 created.
//
// SAFE BY DEFAULT: this script only WRITES to the database when run with
// `--apply`. Without it, it builds the exact same in-memory plan (reading
// real reference data - worlds/lessons/questions/instruments/funds/badges/
// etc. - live from the database) and prints a summary, touching nothing.
// Once ledger rows land they're permanent (CLAUDE.md rule 8-adjacent - this
// is a shared database, D27), so review the dry-run output before ever
// passing --apply.
//
// Deterministic IDs: every row's `id` is derived from a stable string key
// via seedId() below (sha256, not security-sensitive - just needs to be
// stable across runs), never left to the column's own defaultRandom(). This
// is what makes re-running the script (even with --apply) idempotent - every
// insert uses onConflictDoNothing(), so an already-written row is silently
// skipped rather than duplicated or erroring, and the computed plan is
// identical on every run (a seeded PRNG, not Math.random()).
//
// Traceability (the founder's explicit requirement, since ledger/activity
// rows can never be deleted once written to this shared database - D27):
// every seeded user's clerk_user_id starts with "seed_clerk_" and nothing
// else in this codebase ever generates a clerk_user_id with that prefix (a
// real Clerk id is always Clerk's own opaque format). The single query that
// finds every row this script wrote, across every table:
//
//   WITH seed_users AS (SELECT id FROM users WHERE clerk_user_id LIKE 'seed_clerk_%')
//   SELECT 'users', count(*) FROM seed_users
//   UNION ALL SELECT 'parent_contacts', count(*) FROM parent_contacts WHERE user_id IN (SELECT id FROM seed_users)
//   -- ...repeat WHERE user_id IN (SELECT id FROM seed_users) for every other user-scoped table.
//
// (Full version with every table is written to docs/STATUS.md once this
// script is actually run.)
//
// Run via `tsx scripts/seed-dev-users.ts` (dry run) or
// `tsx scripts/seed-dev-users.ts --apply` (real writes).
import "../envConfig";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import {
  aboutMeChips,
  badges,
  certificates,
  cheers,
  coachNoteTemplates,
  competitionEntries,
  competitionTrades,
  competitions,
  consentRecords,
  doubtMessages,
  doubtThreads,
  entitlements,
  fundHoldings,
  fundOrders,
  funds,
  holdings,
  instruments,
  leagueMembers,
  leagues,
  legalAcceptances,
  legalDocuments,
  lessonProgress,
  lessons,
  mentors,
  newsEditions,
  newsStories,
  newsReads,
  notifications,
  orders,
  parentContacts,
  pulseCheckAnswers,
  pulseCheckAttempts,
  questionAnswers,
  quizAttempts,
  rewardClaims,
  rewardRules,
  rewards,
  reportSnapshots,
  sessionTimeDaily,
  sipPlans,
  streaks,
  userAboutMeChips,
  userBadges,
  users,
  vmoneyLedger,
  worlds,
  xpEvents,
} from "../src/db/schema";
import type { LocalizedText } from "../src/db/schema/_helpers";
import { istDateString, istWeekStartDate, istYearMonth } from "../src/lib/ist-date";

const APPLY = process.argv.includes("--apply");
const VM_TO_LEDGER_PAISE = 100; // src/server/economy/schemas.ts - keep in sync
const PLACEHOLDER = "[PLACEHOLDER]";

// ---------- deterministic helpers ----------

function seedId(key: string): string {
  const hash = createHash("sha256").update(`finlamma-dev-seed:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

// mulberry32 - tiny, dependency-free, deterministic PRNG so the whole plan
// (not just ids) is identical on every run, which is what makes the dry-run
// output trustworthy as a preview of what --apply will actually write.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}
function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function L(en: string): LocalizedText {
  return { en: `${PLACEHOLDER} ${en}`, hi: `${PLACEHOLDER} ${en}`, hx: `${PLACEHOLDER} ${en}` };
}

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

// ---------- reference data (read-only) ----------

async function loadReferenceData() {
  const worldRows = await db.select().from(worlds).orderBy(worlds.order);
  const lessonRows = await db.select().from(lessons);
  const mentorRows = await db.select().from(mentors);
  const instrumentRows = await db.select().from(instruments);
  const fundRows = await db.select().from(funds);
  const badgeRows = await db.select().from(badges);
  const rewardRows = await db.select().from(rewards).where(eq(rewards.status, "published"));
  const chipRows = await db.select().from(aboutMeChips).where(eq(aboutMeChips.active, true));
  const legalDocRows = await db.select().from(legalDocuments).where(eq(legalDocuments.status, "published"));
  const competitionRows = await db.select().from(competitions);
  const newsStoryRows = await db.select().from(newsStories);
  const newsEditionRows = await db.select().from(newsEditions);
  const ruleRows = await db.select().from(rewardRules);

  const lessonsByWorld = new Map<string, typeof lessonRows>();
  for (const l of lessonRows) {
    const list = lessonsByWorld.get(l.worldId) ?? [];
    list.push(l);
    lessonsByWorld.set(l.worldId, list);
  }
  const mentorKeyById = new Map(mentorRows.map((m) => [m.id, m.key]));
  const ruleByKind = new Map(ruleRows.map((r) => [r.activityKind, r]));
  const legalDocByType = new Map(legalDocRows.map((d) => [d.type, d]));

  return {
    worldRows,
    lessonsByWorld,
    mentorKeyById,
    instrumentRows,
    fundRows,
    badgeRows,
    rewardRows,
    chipRows,
    legalDocByType,
    competitionRows,
    newsStoryRows,
    newsEditionRows,
    ruleByKind,
  };
}

type RefData = Awaited<ReturnType<typeof loadReferenceData>>;

// ---------- plan accumulator ----------

function emptyPlan() {
  return {
    users: [] as (typeof users.$inferInsert)[],
    parentContacts: [] as (typeof parentContacts.$inferInsert)[],
    consentRecords: [] as (typeof consentRecords.$inferInsert)[],
    legalAcceptances: [] as (typeof legalAcceptances.$inferInsert)[],
    streaks: [] as (typeof streaks.$inferInsert)[],
    lessonProgress: [] as (typeof lessonProgress.$inferInsert)[],
    quizAttempts: [] as (typeof quizAttempts.$inferInsert)[],
    questionAnswers: [] as (typeof questionAnswers.$inferInsert)[],
    xpEvents: [] as (typeof xpEvents.$inferInsert)[],
    vmoneyLedger: [] as (typeof vmoneyLedger.$inferInsert)[],
    userBadges: [] as (typeof userBadges.$inferInsert)[],
    rewardClaims: [] as (typeof rewardClaims.$inferInsert)[],
    certificates: [] as (typeof certificates.$inferInsert)[],
    holdings: [] as (typeof holdings.$inferInsert)[],
    orders: [] as (typeof orders.$inferInsert)[],
    sipPlans: [] as (typeof sipPlans.$inferInsert)[],
    fundOrders: [] as (typeof fundOrders.$inferInsert)[],
    fundHoldings: [] as (typeof fundHoldings.$inferInsert)[],
    leagues: [] as (typeof leagues.$inferInsert)[],
    leagueMembers: [] as (typeof leagueMembers.$inferInsert)[],
    userAboutMeChips: [] as (typeof userAboutMeChips.$inferInsert)[],
    cheers: [] as (typeof cheers.$inferInsert)[],
    notifications: [] as (typeof notifications.$inferInsert)[],
    doubtThreads: [] as (typeof doubtThreads.$inferInsert)[],
    doubtMessages: [] as (typeof doubtMessages.$inferInsert)[],
    sessionTimeDaily: [] as (typeof sessionTimeDaily.$inferInsert)[],
    reportSnapshots: [] as (typeof reportSnapshots.$inferInsert)[],
    coachNoteTemplates: [] as (typeof coachNoteTemplates.$inferInsert)[],
    entitlements: [] as (typeof entitlements.$inferInsert)[],
    newsReads: [] as (typeof newsReads.$inferInsert)[],
    competitionEntries: [] as (typeof competitionEntries.$inferInsert)[],
    competitionTrades: [] as (typeof competitionTrades.$inferInsert)[],
    pulseCheckAttempts: [] as (typeof pulseCheckAttempts.$inferInsert)[],
    pulseCheckAnswers: [] as (typeof pulseCheckAnswers.$inferInsert)[],
  };
}
type Plan = ReturnType<typeof emptyPlan>;

// ---------- per-user profile ----------

type EdgeCase =
  | "minor_consent_pending"
  | "minor_consent_withdrawn"
  | "deleted_account"
  | "trading_locked_boundary"
  | "trading_unlocked_boundary"
  | null;

type Tier = "new" | "mid" | "advanced" | "edge";

type UserProfile = {
  index: number;
  key: string; // "0001".."0050"
  tier: Tier;
  edgeCase: EdgeCase;
  isMinor: boolean;
  dob: string;
  worldsCleared: number; // leading worlds with boss_quiz passed
  streakCurrent: number;
  streakLongest: number;
  wantsTrading: boolean;
  wantsFunds: boolean;
  wantsArena: boolean;
  wantsDoubtZone: boolean;
  wantsReportCard: boolean;
  wantsEntitlement: boolean;
  wantsNews: boolean;
};

function buildProfiles(): UserProfile[] {
  const profiles: UserProfile[] = [];
  const rng = makeRng(42);

  for (let i = 1; i <= 50; i++) {
    const key = String(i).padStart(4, "0");
    let tier: Tier = "mid";
    if (i <= 10) tier = "new";
    else if (i <= 35) tier = "mid";
    else if (i <= 45) tier = "advanced";
    else tier = "edge";

    let edgeCase: EdgeCase = null;
    if (i === 46) edgeCase = "minor_consent_pending";
    else if (i === 47) edgeCase = "minor_consent_withdrawn";
    else if (i === 48) edgeCase = "deleted_account";
    else if (i === 49) edgeCase = "trading_locked_boundary";
    else if (i === 50) edgeCase = "trading_unlocked_boundary";

    const isMinor =
      edgeCase === "minor_consent_pending" || edgeCase === "minor_consent_withdrawn"
        ? true
        : tier !== "edge" && rng() < 0.3;
    const dob = isMinor
      ? istDateString(daysAgo(365 * randInt(rng, 10, 17)))
      : istDateString(daysAgo(365 * randInt(rng, 19, 45)));

    let worldsCleared = 0;
    if (tier === "new") worldsCleared = 0;
    else if (tier === "mid") worldsCleared = randInt(rng, 1, 4);
    else if (tier === "advanced") worldsCleared = randInt(rng, 5, 7);
    if (edgeCase === "minor_consent_withdrawn") worldsCleared = 1;
    if (edgeCase === "deleted_account") worldsCleared = 2;
    if (edgeCase === "trading_locked_boundary") worldsCleared = 2;
    if (edgeCase === "trading_unlocked_boundary") worldsCleared = 3;
    if (edgeCase === "minor_consent_pending") worldsCleared = 0;

    const streakCurrent =
      tier === "new" ? randInt(rng, 1, 3) : tier === "mid" ? randInt(rng, 3, 20) : randInt(rng, 15, 60);
    const streakLongest = Math.max(streakCurrent, streakCurrent + randInt(rng, 0, 10));

    profiles.push({
      index: i,
      key,
      tier,
      edgeCase,
      isMinor,
      dob,
      worldsCleared,
      streakCurrent: edgeCase === "minor_consent_pending" ? 0 : streakCurrent,
      streakLongest: edgeCase === "minor_consent_pending" ? 0 : streakLongest,
      wantsTrading:
        edgeCase === "trading_unlocked_boundary" ||
        (edgeCase === null && tier !== "new" && worldsCleared >= 3 && rng() < 0.7),
      wantsFunds: edgeCase === null && tier === "advanced" && rng() < 0.6,
      wantsArena: edgeCase === null && tier !== "new" && rng() < 0.4,
      wantsDoubtZone: edgeCase === null && tier !== "new" && rng() < 0.3,
      wantsReportCard: edgeCase === null && tier === "advanced",
      wantsEntitlement: edgeCase === null && tier === "advanced" && rng() < 0.3,
      wantsNews: edgeCase === null && tier !== "new" && rng() < 0.35,
    });
  }
  return profiles;
}

// ---------- builders ----------

function buildUser(p: UserProfile): typeof users.$inferInsert {
  const id = seedId(`user:${p.key}`);
  const deleted = p.edgeCase === "deleted_account";
  return {
    id,
    clerkUserId: `seed_clerk_${p.key}`,
    firstName: deleted ? "Deleted user" : `SeedUser${p.key}`,
    lastInitial: deleted ? null : "T",
    email: deleted ? null : `seed+${p.key}@finlamma.dev`,
    phone: null,
    dateOfBirth: deleted ? null : p.dob,
    onboardingCompletedAt: p.edgeCase === "minor_consent_pending" ? null : daysAgo(30),
    language: "en",
    theme: "dark",
    bio: deleted ? null : null,
    state: deleted ? null : pick(makeRng(p.index), ["Maharashtra", "Karnataka", "Delhi", "Tamil Nadu"] as const),
    deletedAt: deleted ? daysAgo(2) : null,
    clerkUpdatedAt: daysAgo(30),
  };
}

// Every gradeable lesson (quiz/boss_quiz/role_play - the only kinds
// scripts/seed-dev-content.ts gave real questionIds to) for every world up
// to `worldsCleared`, plus the matching xp_events/vmoney_ledger credit for
// ALL 6 kinds in a cleared world (video/story/doubt_zone are credited the
// same way the real app would via their own completion endpoint, even
// though - like the real system - they never get a lesson_progress row;
// see lesson_progress.ts's own comment on this gap).
function buildWorldProgress(
  p: UserProfile,
  userId: string,
  ref: RefData,
  rng: () => number,
  plan: Plan,
): void {
  const gradeableKinds = new Set(["quiz", "boss_quiz", "role_play"]);
  for (let wi = 0; wi < p.worldsCleared && wi < ref.worldRows.length; wi++) {
    const world = ref.worldRows[wi]!;
    const worldLessons = ref.lessonsByWorld.get(world.id) ?? [];
    const daysOffset = (p.worldsCleared - wi) * 3;

    for (const lesson of worldLessons) {
      const rule = ref.ruleByKind.get(lesson.kind === "doubt_zone" ? "ai_chat" : (lesson.kind as "video"));
      const activityKind = lesson.kind === "doubt_zone" ? "ai_chat" : lesson.kind;
      if (rule?.active) {
        const multiplier = 1;
        const vmAmountPaise = Math.round(rule.defaultVm * VM_TO_LEDGER_PAISE * multiplier);
        const when = daysAgo(daysOffset);
        plan.xpEvents.push({
          id: seedId(`xp:${p.key}:${lesson.id}`),
          userId,
          amount: rule.defaultXp,
          sourceType: "lesson_completion",
          sourceId: lesson.id,
          ruleId: rule.id,
          reason: `Lesson completed (${activityKind})`,
          createdAt: when,
        });
        plan.vmoneyLedger.push({
          id: seedId(`vm:${p.key}:${lesson.id}`),
          userId,
          amountPaise: vmAmountPaise,
          sourceType: "lesson_completion",
          sourceId: lesson.id,
          ruleId: rule.id,
          multiplierApplied: multiplier,
          reason: `Lesson completed (${activityKind})`,
          createdAt: when,
        });
      }

      if (!gradeableKinds.has(lesson.kind)) continue;
      const content = lesson.content as { questionIds?: string[] };
      const questionIds = content.questionIds ?? [];
      if (questionIds.length === 0) continue;

      const attemptId = seedId(`attempt:${p.key}:${lesson.id}`);
      const accuracyPct = lesson.kind === "boss_quiz" ? randInt(rng, 60, 100) : randInt(rng, 50, 100);
      const correctCount = Math.round((accuracyPct / 100) * questionIds.length);

      plan.lessonProgress.push({
        id: seedId(`lp:${p.key}:${lesson.id}`),
        userId,
        lessonId: lesson.id,
        status: "completed",
        startedAt: daysAgo(daysOffset),
        completedAt: daysAgo(daysOffset),
      });
      plan.quizAttempts.push({
        id: attemptId,
        userId,
        lessonId: lesson.id,
        attemptNumber: 1,
        isFirstPass: true,
        status: "completed",
        startedAt: daysAgo(daysOffset),
        completedAt: daysAgo(daysOffset),
        totalXpPreview: rule?.defaultXp ?? 0,
        accuracyPct,
      });
      questionIds.forEach((qid, idx) => {
        plan.questionAnswers.push({
          id: seedId(`qa:${p.key}:${lesson.id}:${idx}`),
          attemptId,
          questionId: qid,
          stepIndex: idx + 1,
          servedAt: daysAgo(daysOffset),
          timerSeconds: 20,
          servedRevision: 1,
          answeredAt: daysAgo(daysOffset),
          submittedAnswer: { selectedIndex: idx < correctCount ? 0 : 1 },
          isCorrect: idx < correctCount,
          timedOut: false,
          speedBonusAwarded: rng() < 0.3,
          feverActive: false,
          xpAwardedPreview: idx < correctCount ? 20 : 4,
          comboAfter: idx < correctCount ? idx + 1 : 0,
        });
      });
    }

    // Certificate for a cleared world - issued the moment its Boss Quiz is
    // first passed (certificates.ts's own comment).
    const year = new Date().getFullYear();
    plan.certificates.push({
      id: seedId(`cert:${p.key}:${world.id}`),
      userId,
      worldId: world.id,
      code: `FL-${world.code}-${year}-${String(p.index).padStart(6, "0")}`,
      xpEarned: randInt(rng, 100, 2000),
      accuracyPct: randInt(rng, 60, 100),
      fileKey: null,
    });
  }
}

function buildBadges(p: UserProfile, userId: string, ref: RefData, plan: Plan): void {
  const lessonsCompleted = p.worldsCleared * 3; // 3 gradeable lessons/world, matches countCompletedLessonsForUser
  const streakLongest = p.streakLongest;
  const accuracySamples = plan.questionAnswers.filter((qa) =>
    plan.quizAttempts.some((a) => a.id === qa.attemptId && a.userId === userId),
  );
  const total = accuracySamples.length;
  const correct = accuracySamples.filter((qa) => qa.isCorrect).length;
  const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;

  for (const badge of ref.badgeRows) {
    const criteria = badge.criteria as { type: string; threshold: number };
    let progress = 0;
    if (criteria.type === "lessons_completed") progress = lessonsCompleted;
    else if (criteria.type === "streak_days") progress = streakLongest;
    else if (criteria.type === "quiz_accuracy_pct") progress = accuracyPct;
    else continue; // "external" - never auto-awarded
    if (progress < criteria.threshold) continue;

    plan.userBadges.push({ id: seedId(`ub:${p.key}:${badge.id}`), userId, badgeId: badge.id });
    const vmAmountPaise = Math.round(badge.vmReward * VM_TO_LEDGER_PAISE);
    plan.vmoneyLedger.push({
      id: seedId(`vm:badge:${p.key}:${badge.id}`),
      userId,
      amountPaise: vmAmountPaise,
      sourceType: "badge_unlock",
      sourceId: badge.id,
      ruleId: null,
      multiplierApplied: 1,
      reason: `Badge unlocked: ${badge.name.en}`,
    });
  }
}

function vmBalancePaise(plan: Plan, userId: string): number {
  return plan.vmoneyLedger.filter((v) => v.userId === userId).reduce((sum, v) => sum + (v.amountPaise ?? 0), 0);
}

function buildRewardClaims(p: UserProfile, userId: string, ref: RefData, rng: () => number, plan: Plan): void {
  if (p.tier !== "advanced") return;
  const claimCount = randInt(rng, 1, 2);
  const shuffled = [...ref.rewardRows].sort(() => rng() - 0.5);
  let claimed = 0;
  for (const reward of shuffled) {
    if (claimed >= claimCount) break;
    const priceIncPaise = reward.priceVm * VM_TO_LEDGER_PAISE;
    if (vmBalancePaise(plan, userId) < priceIncPaise) continue;
    const claimId = seedId(`claim:${p.key}:${reward.id}`);
    plan.rewardClaims.push({ id: claimId, userId, rewardId: reward.id, pricePaid: reward.priceVm });
    plan.vmoneyLedger.push({
      id: seedId(`vm:claim:${p.key}:${reward.id}`),
      userId,
      amountPaise: -priceIncPaise,
      sourceType: "reward_claim",
      sourceId: claimId,
      ruleId: null,
      multiplierApplied: 1,
      reason: `Reward claimed: ${reward.name.en}`,
    });
    claimed++;
  }
}

function applyFill(
  holding: { qty: number; avgPricePaise: number },
  side: "buy" | "sell",
  qty: number,
  priceP: number,
): { qty: number; avgPricePaise: number; realizedPnlPaise: number | null } {
  if (side === "buy") {
    const newQty = holding.qty + qty;
    const newAvg = newQty > 0 ? Math.round((holding.qty * holding.avgPricePaise + qty * priceP) / newQty) : 0;
    return { qty: newQty, avgPricePaise: newAvg, realizedPnlPaise: null };
  }
  const realized = qty * (priceP - holding.avgPricePaise);
  return { qty: holding.qty - qty, avgPricePaise: holding.avgPricePaise, realizedPnlPaise: realized };
}

function buildTrading(p: UserProfile, userId: string, ref: RefData, rng: () => number, plan: Plan): void {
  if (!p.wantsTrading) return;
  const tradeCount =
    p.edgeCase === "trading_unlocked_boundary" ? 1 : p.tier === "advanced" ? randInt(rng, 4, 8) : randInt(rng, 2, 4);
  const instrumentPool = [...ref.instrumentRows].sort(() => rng() - 0.5).slice(0, Math.min(3, ref.instrumentRows.length));
  const holdingState = new Map<string, { qty: number; avgPricePaise: number }>();

  for (let t = 0; t < tradeCount; t++) {
    const instrument = pick(rng, instrumentPool);
    const state = holdingState.get(instrument.id) ?? { qty: 0, avgPricePaise: 0 };
    const side: "buy" | "sell" = state.qty > 0 && rng() < 0.3 ? "sell" : "buy";
    let qty = side === "sell" ? Math.min(state.qty, randInt(rng, 1, Math.max(1, state.qty))) : randInt(rng, 1, 10);
    if (side === "sell" && qty === 0) continue;
    const priceP = randInt(rng, 5_000, 50_000); // plausible paise price, no live market dependency

    // Never spend more than the user has actually earned so far (lesson/
    // badge VM credited earlier in buildOneUser) - a real trade is rejected
    // outright for insufficient balance (orders.ts's own comment: no DB row
    // at all for a rejection), so seed data must never show a buy the real
    // app would have refused.
    if (side === "buy") {
      const available = vmBalancePaise(plan, userId);
      const maxAffordableQty = Math.floor(available / priceP);
      if (maxAffordableQty < 1) continue;
      qty = Math.min(qty, maxAffordableQty);
    }
    const result = applyFill(state, side, qty, priceP);
    holdingState.set(instrument.id, { qty: result.qty, avgPricePaise: result.avgPricePaise });

    const orderId = seedId(`order:${p.key}:${instrument.id}:${t}`);
    const when = daysAgo(randInt(rng, 1, 30));
    plan.orders.push({
      id: orderId,
      userId,
      instrumentId: instrument.id,
      side,
      type: "market",
      qty,
      limitPricePaise: null,
      status: "filled",
      fillPricePaise: priceP,
      realizedPnlPaise: result.realizedPnlPaise,
      idempotencyKey: `seed-${p.key}-${instrument.id}-${t}`,
      createdAt: when,
      filledAt: when,
    });
    const costPaise = qty * priceP;
    plan.vmoneyLedger.push({
      id: seedId(`vm:trade:${p.key}:${orderId}`),
      userId,
      amountPaise: side === "buy" ? -costPaise : costPaise,
      sourceType: "trade",
      sourceId: orderId,
      ruleId: null,
      multiplierApplied: 1,
      reason: `${side === "buy" ? "Bought" : "Sold"} ${qty} ${instrument.symbol}`,
      createdAt: when,
    });
  }

  for (const [instrumentId, state] of holdingState) {
    if (state.qty === 0 && !plan.orders.some((o) => o.userId === userId && o.instrumentId === instrumentId)) continue;
    plan.holdings.push({
      id: seedId(`holding:${p.key}:${instrumentId}`),
      userId,
      instrumentId,
      qty: state.qty,
      avgPricePaise: state.avgPricePaise,
      positionOpenedAt: daysAgo(randInt(rng, 1, 30)),
    });
  }
}

function buildFunds(p: UserProfile, userId: string, ref: RefData, rng: () => number, plan: Plan): void {
  if (!p.wantsFunds || ref.fundRows.length === 0) return;
  const fund = pick(rng, ref.fundRows);
  const sipId = seedId(`sip:${p.key}:${fund.id}`);
  plan.sipPlans.push({
    id: sipId,
    userId,
    fundId: fund.id,
    amountPaise: fund.minSipPaise,
    dayOfMonth: randInt(rng, 1, 28),
    status: "active",
  });

  const navPaise = randInt(rng, 1000, 10_000); // plausible paise NAV, no fund_navs row needed (not FK-constrained)
  let unitsMilli = 0;
  const orderCount = randInt(rng, 2, 4);
  for (let i = 0; i < orderCount; i++) {
    const amountPaise = fund.minSipPaise;
    if (vmBalancePaise(plan, userId) < amountPaise) break; // never spend more than actually earned so far
    const thisUnitsMilli = Math.round((amountPaise / navPaise) * 1000);
    unitsMilli += thisUnitsMilli;
    const dueDate = istDateString(daysAgo((orderCount - i) * 30));
    plan.fundOrders.push({
      id: seedId(`fundorder:${p.key}:${fund.id}:${i}`),
      userId,
      fundId: fund.id,
      side: "buy",
      status: "filled",
      amountPaise,
      unitsMilli: thisUnitsMilli,
      navPaise,
      navDate: dueDate,
      realizedPnlPaise: null,
      idempotencyKey: null,
      sipPlanId: sipId,
      dueDate,
      failureReason: null,
    });
    plan.vmoneyLedger.push({
      id: seedId(`vm:fund:${p.key}:${fund.id}:${i}`),
      userId,
      amountPaise: -amountPaise,
      sourceType: "fund_trade",
      sourceId: seedId(`fundorder:${p.key}:${fund.id}:${i}`),
      ruleId: null,
      multiplierApplied: 1,
      reason: `SIP purchase: ${fund.name}`,
    });
  }
  plan.fundHoldings.push({
    id: seedId(`fundholding:${p.key}:${fund.id}`),
    userId,
    fundId: fund.id,
    unitsMilli,
    avgNavPaise: navPaise,
  });
}

function buildArena(p: UserProfile, userId: string, ref: RefData, rng: () => number, plan: Plan): void {
  if (!p.wantsArena) return;
  const leagueId = seedId("league:global");
  if (!plan.leagues.some((l) => l.id === leagueId)) {
    plan.leagues.push({ id: leagueId, scope: "global" });
  }
  plan.leagueMembers.push({
    id: seedId(`leaguemember:${p.key}`),
    leagueId,
    userId,
    zone: pick(rng, ["promote", "safe", "demote"] as const),
    rank: randInt(rng, 1, 200),
  });
  if (ref.chipRows.length > 0) {
    const chipCount = randInt(rng, 1, Math.min(3, ref.chipRows.length));
    const chosen = [...ref.chipRows].sort(() => rng() - 0.5).slice(0, chipCount);
    for (const chip of chosen) {
      plan.userAboutMeChips.push({
        id: seedId(`chip:${p.key}:${chip.id}`),
        userId,
        chipId: chip.id,
      });
    }
  }
}

function buildDoubtZone(p: UserProfile, userId: string, ref: RefData, rng: () => number, plan: Plan): void {
  if (!p.wantsDoubtZone || ref.worldRows.length === 0) return;
  const world = ref.worldRows[0]!;
  const threadId = seedId(`doubtthread:${p.key}`);
  plan.doubtThreads.push({
    id: threadId,
    userId,
    mentorId: world.mentorId,
    lessonId: null,
    lastMessageAt: daysAgo(1),
  });
  const messageCount = randInt(rng, 2, 6);
  for (let m = 0; m < messageCount; m++) {
    plan.doubtMessages.push({
      id: seedId(`doubtmsg:${p.key}:${m}`),
      threadId,
      role: m % 2 === 0 ? "learner" : "assistant",
      content: `${PLACEHOLDER} Dev-seed Doubt Zone message ${m + 1}`,
      flagged: false,
      flaggedCategory: null,
      flaggedReason: null,
      reviewedAt: null,
      reviewedBy: null,
      createdAt: daysAgo(messageCount - m),
    });
  }
}

function buildNotifications(p: UserProfile, userId: string, rng: () => number, plan: Plan): void {
  const kinds = ["streak_risk", "boss_battle", "market_news", "session_goal", "cheer_received", "league_rank_change"] as const;
  const count = randInt(rng, 2, 4);
  for (let n = 0; n < count; n++) {
    const kind = pick(rng, kinds);
    const read = rng() < 0.5;
    const createdAt = daysAgo(randInt(rng, 0, 10));
    plan.notifications.push({
      id: seedId(`notif:${p.key}:${n}`),
      userId,
      kind,
      title: L(`Notification: ${kind}`),
      body: L(`Dev-seed notification body for ${kind}`),
      data: {},
      readAt: read ? createdAt : null,
      createdAt,
    });
  }
}

function buildSessionTime(p: UserProfile, userId: string, rng: () => number, plan: Plan): void {
  if (p.edgeCase === "minor_consent_pending") return;
  for (let d = 0; d < 7; d++) {
    plan.sessionTimeDaily.push({
      id: seedId(`session:${p.key}:${d}`),
      userId,
      dateIst: istDateString(daysAgo(d)),
      seconds: randInt(rng, 60, 1800),
    });
  }
}

function buildReportCard(p: UserProfile, userId: string, plan: Plan): void {
  if (!p.wantsReportCard) return;
  const categories = ["strength", "gap", "opportunity", "habit"] as const;
  const noteIdByCategory = new Map(categories.map((c) => [c, seedId(`coachnote:${c}`)]));
  if (plan.coachNoteTemplates.length === 0) {
    for (const category of categories) {
      plan.coachNoteTemplates.push({
        id: noteIdByCategory.get(category)!,
        category,
        template: L(`Coach note template (${category}): {{topic}} at {{pct}}%`),
        status: "published",
        publishedAt: new Date(),
      });
    }
  }
  plan.reportSnapshots.push({
    id: seedId(`report:${p.key}`),
    userId,
    weekStartDate: istWeekStartDate(daysAgo(7)),
    efficiencyScore: 72,
    subMetrics: { retention: 70, watchSpeed: 65, quizAccuracy: 80, consistency: 75 },
    moduleBreakdown: [],
    topicMastery: [],
    strengthNoteId: noteIdByCategory.get("strength")!,
    gapNoteId: noteIdByCategory.get("gap")!,
    opportunityNoteId: noteIdByCategory.get("opportunity")!,
    habitNoteId: noteIdByCategory.get("habit")!,
    opportunityTopic: { topic: "Inflation", accuracyPct: 60 },
    habitDetail: { bestWeekday: "Saturday", streakBroken: false },
  });
}

function buildEntitlement(p: UserProfile, userId: string, plan: Plan): void {
  if (!p.wantsEntitlement) return;
  plan.entitlements.push({
    id: seedId(`entitlement:${p.key}`),
    userId,
    entitlement: "ad_free",
    source: "revenuecat",
    expiresAt: daysAgo(-30),
    raw: { placeholder: true },
  });
}

function buildNewsAndPulseCheck(p: UserProfile, userId: string, ref: RefData, rng: () => number, plan: Plan): void {
  if (!p.wantsNews) return;
  for (const story of ref.newsStoryRows) {
    if (rng() < 0.5) continue;
    plan.newsReads.push({
      id: seedId(`newsread:${p.key}:${story.id}`),
      userId,
      storyId: story.id,
      readAt: daysAgo(randInt(rng, 0, 5)),
      dwellSeconds: randInt(rng, 10, 60),
    });
  }
  const edition = ref.newsEditionRows[0];
  if (!edition || edition.questionIds.length === 0) return;
  const attemptId = seedId(`pulseattempt:${p.key}`);
  const accuracyPct = randInt(rng, 50, 100);
  const correctCount = Math.round((accuracyPct / 100) * edition.questionIds.length);
  plan.pulseCheckAttempts.push({
    id: attemptId,
    userId,
    editionId: edition.id,
    status: "completed",
    startedAt: daysAgo(1),
    completedAt: daysAgo(1),
    accuracyPct,
    bestCombo: correctCount,
    allCorrectBonusAwarded: correctCount === edition.questionIds.length,
    rawVmEarnedPaise: correctCount * 500,
    totalVmAwardedPaise: correctCount * 500,
    dailyCapReached: false,
  });
  edition.questionIds.forEach((qid, idx) => {
    plan.pulseCheckAnswers.push({
      id: seedId(`pulseanswer:${p.key}:${idx}`),
      attemptId,
      questionId: qid,
      stepIndex: idx + 1,
      servedAt: daysAgo(1),
      timerSeconds: 15,
      servedRevision: 1,
      answeredAt: daysAgo(1),
      submittedAnswer: { selectedIndex: idx < correctCount ? 0 : 1 },
      isCorrect: idx < correctCount,
      timedOut: false,
      speedBonusAwarded: false,
      comboAfter: idx < correctCount ? idx + 1 : 0,
      vmAwardedPaise: idx < correctCount ? 500 : 0,
    });
  });
  plan.vmoneyLedger.push({
    id: seedId(`vm:pulse:${p.key}`),
    userId,
    amountPaise: correctCount * 500,
    sourceType: "pulse_check_attempt",
    sourceId: attemptId,
    ruleId: null,
    multiplierApplied: 1,
    reason: "Pulse Check completed",
  });
}

function buildCompetition(p: UserProfile, userId: string, ref: RefData, rng: () => number, plan: Plan): void {
  if (p.tier !== "advanced") return;
  const open = ref.competitionRows.find((c) => c.windowEnd > new Date() && c.status === "published");
  if (!open) return;
  const entryId = seedId(`compentry:${p.key}`);
  let cash = open.virtualCapitalPaise;
  let qty = 0;
  let avg = 0;
  const tradeCount = randInt(rng, 1, 3);
  for (let t = 0; t < tradeCount; t++) {
    const side: "buy" | "sell" = qty > 0 && rng() < 0.3 ? "sell" : "buy";
    const priceP = randInt(rng, 10_000, 100_000);
    let tradeQty = side === "sell" ? Math.min(qty, 1) : randInt(rng, 1, 3);
    if (side === "sell" && tradeQty === 0) continue;
    if (side === "buy") {
      const maxAffordableQty = Math.floor(cash / priceP);
      if (maxAffordableQty < 1) continue;
      tradeQty = Math.min(tradeQty, maxAffordableQty);
    }
    const result = applyFill({ qty, avgPricePaise: avg }, side, tradeQty, priceP);
    qty = result.qty;
    avg = result.avgPricePaise;
    cash += side === "buy" ? -tradeQty * priceP : tradeQty * priceP;
    plan.competitionTrades.push({
      id: seedId(`comptrade:${p.key}:${t}`),
      entryId,
      side,
      qty: tradeQty,
      fillPricePaise: priceP,
      realizedPnlPaise: result.realizedPnlPaise,
      idempotencyKey: `seed-${p.key}-${t}`,
      filledAt: daysAgo(randInt(rng, 1, 5)),
    });
  }
  plan.competitionEntries.push({
    id: entryId,
    competitionId: open.id,
    userId,
    enteredAt: daysAgo(6),
    cashPaise: cash,
    qtyHeld: qty,
    avgPricePaise: avg,
  });
}

function buildComplianceAndStreaks(p: UserProfile, userId: string, ref: RefData, plan: Plan): void {
  // Streaks: always a "learning" row (missing = 0, per streaks.ts's own
  // comment, but every non-locked-out seed user gets one for realism).
  if (p.edgeCase !== "minor_consent_pending") {
    plan.streaks.push({
      id: seedId(`streak:${p.key}:learning`),
      userId,
      scope: "learning",
      current: p.streakCurrent,
      longest: p.streakLongest,
      lastActiveDateIst: istDateString(),
      freezesLeft: 2,
      freezesResetMonth: istYearMonth(),
    });
  }

  // Legal acceptances - every non-pending user has accepted the currently
  // published version of each doc type, self (+ parent, if a consented
  // minor).
  const legalEligible = p.edgeCase !== "minor_consent_pending";
  if (legalEligible) {
    for (const doc of ref.legalDocByType.values()) {
      plan.legalAcceptances.push({
        id: seedId(`legalaccept:${p.key}:self:${doc.type}`),
        userId,
        legalDocumentId: doc.id,
        acceptedBy: "self",
        acceptedAt: daysAgo(30),
      });
      if (p.isMinor && p.edgeCase !== "minor_consent_withdrawn") {
        plan.legalAcceptances.push({
          id: seedId(`legalaccept:${p.key}:parent:${doc.type}`),
          userId,
          legalDocumentId: doc.id,
          acceptedBy: "parent",
          acceptedAt: daysAgo(30),
        });
      }
    }
  }

  if (!p.isMinor) return;

  const parentContactId = seedId(`parent:${p.key}`);
  plan.parentContacts.push({
    id: parentContactId,
    userId,
    name: `${PLACEHOLDER} Seed Parent ${p.key}`,
    email: `seed-parent+${p.key}@finlamma.dev`,
    verifiedAt: p.edgeCase === "minor_consent_pending" ? null : daysAgo(30),
    weeklyReportOptIn: false,
    weeklyReportUnsubscribeTokenHash: null,
  });

  const baseConsent = {
    id: seedId(`consent:${p.key}`),
    userId,
    parentContactId,
    method: "email_link" as const,
    tokenHash: seedId(`consenttoken:${p.key}`),
    tokenExpiresAt: daysAgo(-7),
  };
  if (p.edgeCase === "minor_consent_pending") {
    plan.consentRecords.push({ ...baseConsent, status: "pending" });
  } else if (p.edgeCase === "minor_consent_withdrawn") {
    plan.consentRecords.push({
      ...baseConsent,
      status: "withdrawn",
      usedAt: daysAgo(40),
      actedAt: daysAgo(10),
    });
  } else {
    plan.consentRecords.push({
      ...baseConsent,
      status: "consented",
      usedAt: daysAgo(30),
      actedAt: daysAgo(30),
    });
  }
}

function buildOneUser(p: UserProfile, ref: RefData, plan: Plan): void {
  const userId = seedId(`user:${p.key}`);
  const rng = makeRng(1000 + p.index);

  plan.users.push(buildUser(p));
  buildComplianceAndStreaks(p, userId, ref, plan);

  if (p.edgeCase === "minor_consent_pending") return; // blocked - no activity at all

  buildWorldProgress(p, userId, ref, rng, plan);
  buildBadges(p, userId, ref, plan);
  // Trading/funds get first claim on earned balance (the higher-value test
  // surface); reward claims spend only whatever's left over, so one doesn't
  // starve the other for every user the way "claim rewards first" did.
  buildTrading(p, userId, ref, rng, plan);
  buildFunds(p, userId, ref, rng, plan);
  buildRewardClaims(p, userId, ref, rng, plan);
  buildArena(p, userId, ref, rng, plan);
  buildDoubtZone(p, userId, ref, rng, plan);
  buildNotifications(p, userId, rng, plan);
  buildSessionTime(p, userId, rng, plan);
  buildReportCard(p, userId, plan);
  buildEntitlement(p, userId, plan);
  buildNewsAndPulseCheck(p, userId, ref, rng, plan);
  buildCompetition(p, userId, ref, rng, plan);
}

function mergePlans(plans: Plan[]): Plan {
  const merged = emptyPlan();
  for (const plan of plans) {
    for (const k of Object.keys(merged) as (keyof Plan)[]) {
      (merged[k] as unknown[]).push(...(plan[k] as unknown[]));
    }
  }
  // De-dupe shared reference-ish rows a per-user builder may emit more than
  // once (leagues, coach_note_templates) by id.
  merged.leagues = dedupeById(merged.leagues);
  merged.coachNoteTemplates = dedupeById(merged.coachNoteTemplates);
  return merged;
}
function dedupeById<T extends { id?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (row.id && seen.has(row.id)) continue;
    if (row.id) seen.add(row.id);
    out.push(row);
  }
  return out;
}

async function writePlan(plan: Plan): Promise<void> {
  // Dependency order: users first, then everything else (all FK to users or
  // to rows this same plan just inserted, like orders before holdings).
  await db.insert(users).values(plan.users).onConflictDoNothing();
  await db.insert(parentContacts).values(plan.parentContacts).onConflictDoNothing();
  await db.insert(consentRecords).values(plan.consentRecords).onConflictDoNothing();
  await db.insert(legalAcceptances).values(plan.legalAcceptances).onConflictDoNothing();
  await db.insert(streaks).values(plan.streaks).onConflictDoNothing();
  await db.insert(lessonProgress).values(plan.lessonProgress).onConflictDoNothing();
  await db.insert(quizAttempts).values(plan.quizAttempts).onConflictDoNothing();
  await db.insert(questionAnswers).values(plan.questionAnswers).onConflictDoNothing();
  await db.insert(xpEvents).values(plan.xpEvents).onConflictDoNothing();
  await db.insert(vmoneyLedger).values(plan.vmoneyLedger).onConflictDoNothing();
  await db.insert(userBadges).values(plan.userBadges).onConflictDoNothing();
  await db.insert(rewardClaims).values(plan.rewardClaims).onConflictDoNothing();
  await db.insert(certificates).values(plan.certificates).onConflictDoNothing();
  await db.insert(orders).values(plan.orders).onConflictDoNothing();
  await db.insert(holdings).values(plan.holdings).onConflictDoNothing();
  await db.insert(sipPlans).values(plan.sipPlans).onConflictDoNothing();
  await db.insert(fundOrders).values(plan.fundOrders).onConflictDoNothing();
  await db.insert(fundHoldings).values(plan.fundHoldings).onConflictDoNothing();
  await db.insert(leagues).values(plan.leagues).onConflictDoNothing();
  await db.insert(leagueMembers).values(plan.leagueMembers).onConflictDoNothing();
  await db.insert(userAboutMeChips).values(plan.userAboutMeChips).onConflictDoNothing();
  await db.insert(cheers).values(plan.cheers).onConflictDoNothing();
  await db.insert(notifications).values(plan.notifications).onConflictDoNothing();
  await db.insert(doubtThreads).values(plan.doubtThreads).onConflictDoNothing();
  await db.insert(doubtMessages).values(plan.doubtMessages).onConflictDoNothing();
  await db.insert(sessionTimeDaily).values(plan.sessionTimeDaily).onConflictDoNothing();
  await db.insert(coachNoteTemplates).values(plan.coachNoteTemplates).onConflictDoNothing();
  await db.insert(reportSnapshots).values(plan.reportSnapshots).onConflictDoNothing();
  await db.insert(entitlements).values(plan.entitlements).onConflictDoNothing();
  await db.insert(newsReads).values(plan.newsReads).onConflictDoNothing();
  await db.insert(pulseCheckAttempts).values(plan.pulseCheckAttempts).onConflictDoNothing();
  await db.insert(pulseCheckAnswers).values(plan.pulseCheckAnswers).onConflictDoNothing();
  await db.insert(competitionEntries).values(plan.competitionEntries).onConflictDoNothing();
  await db.insert(competitionTrades).values(plan.competitionTrades).onConflictDoNothing();
}

// Cheers needs the full cross-user pool (sender/receiver, never the same
// user - cheers.ts's own comment), so it runs once over every profile after
// merging, not inside buildOneUser like everything else.
function buildCheers(profiles: UserProfile[], plan: Plan): void {
  const rng = makeRng(777);
  const arenaUserIds = profiles.filter((p) => p.wantsArena).map((p) => seedId(`user:${p.key}`));
  if (arenaUserIds.length < 2) return;
  const pairCount = Math.min(8, arenaUserIds.length * 2);
  const seenPairs = new Set<string>();
  let attempts = 0;
  while (plan.cheers.length < pairCount && attempts < pairCount * 10) {
    attempts++;
    const sender = pick(rng, arenaUserIds);
    const receiver = pick(rng, arenaUserIds);
    if (sender === receiver) continue;
    const dateIst = istDateString(daysAgo(randInt(rng, 0, 3)));
    const pairKey = `${sender}:${receiver}:${dateIst}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    plan.cheers.push({
      id: seedId(`cheer:${pairKey}`),
      senderId: sender,
      receiverId: receiver,
      cheerDateIst: dateIst,
    });
  }
}

function printSummary(profiles: UserProfile[], plan: Plan): void {
  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN (pass --apply to write for real)"}`);
  console.log(`\nProfiles: ${profiles.length}`);
  const byTier = new Map<string, number>();
  for (const p of profiles) byTier.set(p.tier, (byTier.get(p.tier) ?? 0) + 1);
  for (const [tier, n] of byTier) console.log(`  ${tier}: ${n}`);
  console.log(`  edge cases: ${profiles.filter((p) => p.edgeCase).map((p) => p.edgeCase).join(", ")}`);

  console.log("\nRow counts per table:");
  for (const key of Object.keys(plan) as (keyof Plan)[]) {
    console.log(`  ${key}: ${plan[key].length}`);
  }

  const sample = profiles.find((p) => p.tier === "advanced")!;
  const sampleUserId = seedId(`user:${sample.key}`);
  console.log(`\nSample advanced-tier user (${sample.key}):`);
  console.log(`  worldsCleared=${sample.worldsCleared}, streak=${sample.streakCurrent}/${sample.streakLongest}`);
  console.log(`  xp_events: ${plan.xpEvents.filter((r) => r.userId === sampleUserId).length}`);
  console.log(`  vmoney_ledger: ${plan.vmoneyLedger.filter((r) => r.userId === sampleUserId).length}`);
  console.log(`  orders: ${plan.orders.filter((r) => r.userId === sampleUserId).length}`);
  console.log(`  holdings: ${plan.holdings.filter((r) => r.userId === sampleUserId).length}`);
  console.log(`  vmoney balance (paise): ${vmBalancePaise(plan, sampleUserId)}`);

  console.log("\nEdge cases:");
  for (const p of profiles.filter((p) => p.edgeCase)) {
    const uid = seedId(`user:${p.key}`);
    const user = plan.users.find((u) => u.id === uid)!;
    console.log(`  ${p.key} (${p.edgeCase}):`);
    console.log(
      `    worldsCleared=${p.worldsCleared}, deletedAt=${user.deletedAt ?? "null"}, email=${user.email ?? "null"}`,
    );
    console.log(
      `    consent=${plan.consentRecords.find((c) => c.userId === uid)?.status ?? "n/a"}, ` +
        `orders=${plan.orders.filter((r) => r.userId === uid).length}, ` +
        `holdings=${plan.holdings.filter((r) => r.userId === uid).length}, ` +
        `vmoney_ledger rows=${plan.vmoneyLedger.filter((r) => r.userId === uid).length}, ` +
        `balance=${vmBalancePaise(plan, uid)}`,
    );
  }

  console.log("\nInvariant checks:");
  const negativeBalances = profiles.filter((p) => vmBalancePaise(plan, seedId(`user:${p.key}`)) < 0);
  console.log(
    negativeBalances.length === 0
      ? "  OK: no user has a negative V Money balance"
      : `  FAIL: ${negativeBalances.length} user(s) have a negative balance: ${negativeBalances.map((p) => p.key).join(", ")}`,
  );
  const negativeHoldings = plan.holdings.filter((h) => h.qty! < 0);
  console.log(
    negativeHoldings.length === 0
      ? "  OK: no holding has a negative qty"
      : `  FAIL: ${negativeHoldings.length} holding(s) have negative qty`,
  );
}

async function main() {
  const ref = await loadReferenceData();
  if (ref.worldRows.length === 0) {
    console.error("No worlds found - run pnpm seed:worlds and pnpm seed:dev-content first.");
    process.exit(1);
  }
  const profiles = buildProfiles();
  const perUserPlans = profiles.map((p) => {
    const plan = emptyPlan();
    buildOneUser(p, ref, plan);
    return plan;
  });
  const plan = mergePlans(perUserPlans);
  buildCheers(profiles, plan);

  printSummary(profiles, plan);

  if (APPLY) {
    await writePlan(plan);
    console.log("\nWrote all rows (onConflictDoNothing - already-existing rows were skipped).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
