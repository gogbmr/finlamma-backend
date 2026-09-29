import { istDateString, istWeekStartDate, istWeekStartUtc } from "@/lib/ist-date";
import { getSettingNumber } from "@/lib/settings";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { creditXpRow, sumXpSince } from "@/server/economy/repo";
import { getLevelInfo } from "@/server/leveling/service";
import { getQuizAccuracyTotalsForUser } from "@/server/quiz-attempts/repo";
import { getRankTitleForLevel } from "@/server/rank-titles/service";
import { getStreakStats } from "@/server/streaks/service";
import { getMyBadges } from "@/server/badges/service";
import { isUniqueViolation } from "@/lib/db-errors";
import type { LocalizedText } from "@/db/schema/_helpers";
import type { AboutMeChipInput } from "./schemas";
import {
  countCheersReceivedSince,
  countCompletedLessonsForUserInWorld,
  countPublishedLessonsInWorld,
  deleteAboutMeChipRow,
  findCheerableUser,
  getAboutMeChipById,
  getCurrentWorldIdForUser,
  getDisplayNamesForUserIds,
  getSelectedChipsForUser,
  getWorldTitleById,
  getWorldXpSparklines,
  insertAboutMeChip,
  insertCheerIfNew,
  listActiveAboutMeChips,
  listAboutMeChips,
  listPublishedWorldsOrdered,
  listRecentXpEvents,
  replaceUserChipSelection,
  sumCheerXpCreditedToday,
  updateAboutMeChipRow,
  weeklyXpByScope,
  xpByWorldInRange,
} from "./repo";
import { encodeScope, resolveScopeForRequest, type ArenaScope } from "./scope";

export const ARENA_MIN_LEADERBOARD_POOL_SIZE_KEY = "arena_min_leaderboard_pool_size";
export const DEFAULT_ARENA_MIN_LEADERBOARD_POOL_SIZE = 20;

// AR-12: "+5 XP" per the prototype/PRODUCT_SPEC.md §3, admin-tunable rather
// than hardcoded (same reasoning as every other reward amount in this
// codebase). The daily cap bounds a receiver's total CHEERS income per IST
// day - not the number of cheers itself, which is already bounded to one
// per sender per day (the `cheers` table's own unique index).
export const CHEER_XP_AMOUNT_KEY = "arena_cheer_xp_amount";
export const DEFAULT_CHEER_XP_AMOUNT = 5;
export const CHEER_DAILY_XP_CAP_KEY = "arena_cheer_daily_xp_cap";
export const DEFAULT_CHEER_DAILY_XP_CAP = 50;

// The number of ranked rows returned outright - AR-06/AR-10 also want the
// caller's own row even when it falls outside this window, handled
// separately below as `self`.
const LEADERBOARD_ROW_LIMIT = 50;

// AR-04's 7-day sparkline.
const WORLD_SPARKLINE_DAYS = 7;

// AR-03's activity ticker length.
const ACTIVITY_FEED_LIMIT = 20;

export type LeaderboardRowView = {
  rank: number;
  userId: string;
  firstName: string | null;
  lastInitial: string | null;
  xp: number;
  isSelf: boolean;
};

export type LeaderboardView = {
  requestedScope: string;
  scope: string;
  fallbackApplied: boolean;
  notEnoughPlayers: boolean;
  weekStartDate: string;
  poolSize: number;
  rows: LeaderboardRowView[];
  self: { rank: number; xp: number } | null;
};

async function requestedScopeForUser(
  userId: string,
  kind: "world" | "state" | "india" | "global",
  userState: string | null,
): Promise<ArenaScope> {
  if (kind === "global") return { kind: "global" };
  if (kind === "india") return { kind: "india" };
  if (kind === "state") {
    // No state on file at all falls back to India outright - there's no
    // "unknown state" pool to be thin or safe about, it simply doesn't
    // exist. The app should only offer this scope chip once the learner has
    // one set (PATCH /me), but the endpoint stays safe either way.
    return userState ? { kind: "state", state: userState } : { kind: "india" };
  }
  const worldId = await getCurrentWorldIdForUser(userId);
  // No published world exists at all (a genuinely empty catalog) - fall
  // back to India rather than a scope with a null id, which would have
  // nothing meaningful to encode.
  return worldId ? { kind: "world", worldId } : { kind: "india" };
}

function rankRows(rows: { userId: string; xp: number }[]): { userId: string; xp: number; rank: number }[] {
  return [...rows]
    .sort((a, b) => b.xp - a.xp)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

// The shared core behind both GET /arena/leaderboard (the caller's own
// scope, derived from their profile) and GET /arena/worlds/{id}/leaderboard
// (an explicit world someone tapped into from the Worlds list) - same
// ranking, same privacy floor, same self-row handling either way.
async function buildLeaderboardView(
  user: { id: string; state: string | null },
  requested: ArenaScope,
  weekStartUtc: Date,
  weekStartDate: string,
  minPoolSize: number,
): Promise<LeaderboardView> {
  const requestedRows = await weeklyXpByScope(requested, weekStartUtc);

  let resolution = resolveScopeForRequest(requested, requestedRows.length, minPoolSize);
  let rows = requestedRows;

  if (resolution.fallbackFrom) {
    // One hop only (state -> india, see scope.ts) - re-check India's own
    // pool size too, so a fallback can never itself land below the floor
    // silently.
    rows = await weeklyXpByScope(resolution.resolved, weekStartUtc);
    if (rows.length < minPoolSize) {
      resolution = { ...resolution, notEnoughPlayers: true };
    }
  }

  const ranked = rankRows(rows);
  const names = await getDisplayNamesForUserIds(ranked.map((r) => r.userId));
  const selfRanked = ranked.find((r) => r.userId === user.id) ?? null;
  const topRows = ranked.slice(0, LEADERBOARD_ROW_LIMIT);
  const selfInTop = topRows.some((r) => r.userId === user.id);

  const viewRows: LeaderboardRowView[] = topRows.map((r) => {
    const name = names.get(r.userId);
    return {
      rank: r.rank,
      userId: r.userId,
      firstName: name?.firstName ?? null,
      lastInitial: name?.lastInitial ?? null,
      xp: r.xp,
      isSelf: r.userId === user.id,
    };
  });

  if (selfRanked && !selfInTop) {
    const name = names.get(selfRanked.userId);
    viewRows.push({
      rank: selfRanked.rank,
      userId: selfRanked.userId,
      firstName: name?.firstName ?? null,
      lastInitial: name?.lastInitial ?? null,
      xp: selfRanked.xp,
      isSelf: true,
    });
  }

  return {
    requestedScope: encodeScope(requested),
    scope: encodeScope(resolution.resolved),
    fallbackApplied: resolution.fallbackFrom !== null,
    notEnoughPlayers: resolution.notEnoughPlayers,
    weekStartDate,
    poolSize: rows.length,
    rows: viewRows,
    self: selfRanked ? { rank: selfRanked.rank, xp: selfRanked.xp } : null,
  };
}

async function weekContext() {
  const now = new Date();
  const minPoolSize = await getSettingNumber(
    ARENA_MIN_LEADERBOARD_POOL_SIZE_KEY,
    DEFAULT_ARENA_MIN_LEADERBOARD_POOL_SIZE,
  );
  return { weekStartUtc: istWeekStartUtc(now), weekStartDate: istWeekStartDate(now), minPoolSize };
}

export async function getLeaderboard(
  user: { id: string; state: string | null },
  requestedKind: "world" | "state" | "india" | "global",
): Promise<LeaderboardView> {
  const { weekStartUtc, weekStartDate, minPoolSize } = await weekContext();
  const requested = await requestedScopeForUser(user.id, requestedKind, user.state);
  return buildLeaderboardView(user, requested, weekStartUtc, weekStartDate, minPoolSize);
}

// AR-06: drilling into a SPECIFIC world's own leaderboard (tapped from the
// Worlds list), not necessarily the caller's own current world - same
// privacy floor applies (a thin world just reports notEnoughPlayers, there
// being no broader scope to fall back to).
export async function getWorldLeaderboard(
  user: { id: string; state: string | null },
  worldId: string,
): Promise<LeaderboardView> {
  const { weekStartUtc, weekStartDate, minPoolSize } = await weekContext();
  return buildLeaderboardView(user, { kind: "world", worldId }, weekStartUtc, weekStartDate, minPoolSize);
}

export type WorldsLeaderboardRow = {
  worldId: string;
  title: { en: string; hi: string; hx: string };
  xp: number;
  memberCount: number;
  xpPerMember: number;
  deltaPct: number | null;
  sparkline: { date: string; xp: number }[];
};

// AR-04/05: the World-battle strip + full table. Ranked by total weekly XP
// (PRODUCT_SPEC.md §3's "XP per world and XP-per-member so small worlds can
// compete" is what xpPerMember surfaces alongside the raw total). A world
// with zero current members this week is omitted rather than shown at 0 -
// there's nothing to rank.
export async function getWorldsLeaderboard(): Promise<{ weekStartDate: string; worlds: WorldsLeaderboardRow[] }> {
  const { weekStartUtc, weekStartDate } = await weekContext();
  const previousWeekStartUtc = new Date(weekStartUtc.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [thisWeek, lastWeek, allWorlds] = await Promise.all([
    xpByWorldInRange(weekStartUtc),
    xpByWorldInRange(previousWeekStartUtc, weekStartUtc),
    listPublishedWorldsOrdered(),
  ]);

  const lastWeekByWorld = new Map(lastWeek.map((w) => [w.worldId, w.xp]));
  const sparklines = await getWorldXpSparklines(
    thisWeek.map((w) => w.worldId),
    WORLD_SPARKLINE_DAYS,
  );
  const titleByWorld = new Map(allWorlds.map((w) => [w.id, w.title]));

  const rows: WorldsLeaderboardRow[] = thisWeek
    .filter((w) => titleByWorld.has(w.worldId))
    .map((w) => {
      const previous = lastWeekByWorld.get(w.worldId) ?? 0;
      const deltaPct = previous > 0 ? Math.round(((w.xp - previous) / previous) * 100) : null;
      return {
        worldId: w.worldId,
        title: titleByWorld.get(w.worldId)!,
        xp: w.xp,
        memberCount: w.memberCount,
        xpPerMember: w.memberCount > 0 ? Math.round(w.xp / w.memberCount) : 0,
        deltaPct,
        sparkline: sparklines.get(w.worldId) ?? [],
      };
    })
    .sort((a, b) => b.xp - a.xp);

  return { weekStartDate, worlds: rows };
}

export type ActivityFeedItem = {
  firstName: string | null;
  lastInitial: string | null;
  amount: number;
  createdAt: string;
};

// AR-03: a live-feeling marquee of recent XP credits. Kid-safe display name
// only (first name + last initial), same as every other Arena surface.
export async function getActivityFeed(): Promise<{ items: ActivityFeedItem[] }> {
  const rows = await listRecentXpEvents(ACTIVITY_FEED_LIMIT);
  return {
    items: rows.map((r) => ({
      firstName: r.firstName,
      lastInitial: r.lastInitial,
      amount: r.amount,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export type SendCheerResult = { alreadyCheeredToday: boolean; xpAwarded: number; dailyCapReached: boolean };

// AR-12. Server-enforced end to end - never trusts the app to have already
// hidden a cheer button for a self-row or an opted-out receiver.
// Idempotent per (sender, receiver, IST day) at the DB level (D26-style):
// a repeat cheer the same day is a successful no-op, never a second credit,
// which is what "un-cheer/re-cheer never re-awards XP" (the founder's
// decision, docs/DATA_MODEL.md) reduces to when there is no separate
// un-cheer action to begin with.
export async function sendCheer(
  sender: { id: string },
  receiverId: string,
  meta: ReturnType<typeof requestMeta>,
): Promise<SendCheerResult> {
  if (sender.id === receiverId) {
    throw new AppError("VALIDATION_FAILED", "You can't cheer yourself");
  }

  const receiver = await findCheerableUser(receiverId);
  if (!receiver || receiver.deletedAt) {
    throw new AppError("NOT_FOUND", "Learner not found");
  }
  // Absent key (a row saved before D53 added this preference) defaults to
  // enabled - only an explicit `false` opts out, see users.ts's schema
  // comment on cheersEnabled.
  if (receiver.preferences?.cheersEnabled === false) {
    throw new AppError("CHEER_RECEIVER_OPTED_OUT", "This learner isn't receiving cheers right now");
  }

  const todayIst = istDateString(new Date());
  const cheerRow = await insertCheerIfNew(sender.id, receiverId, todayIst);
  if (!cheerRow) {
    return { alreadyCheeredToday: true, xpAwarded: 0, dailyCapReached: false };
  }

  await logActivity({
    actorType: "user",
    actorId: sender.id,
    action: "arena.cheer_sent",
    targetType: "user",
    targetId: receiverId,
    metadata: { cheerId: cheerRow.id },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const [cheerXpAmount, dailyCap, alreadyCreditedToday] = await Promise.all([
    getSettingNumber(CHEER_XP_AMOUNT_KEY, DEFAULT_CHEER_XP_AMOUNT),
    getSettingNumber(CHEER_DAILY_XP_CAP_KEY, DEFAULT_CHEER_DAILY_XP_CAP),
    sumCheerXpCreditedToday(receiverId, todayIst),
  ]);
  const remaining = Math.max(0, dailyCap - alreadyCreditedToday);
  const toCredit = Math.min(cheerXpAmount, remaining);

  if (toCredit > 0) {
    await creditXpRow({
      userId: receiverId,
      amount: toCredit,
      sourceType: "cheer",
      sourceId: cheerRow.id,
      ruleId: null,
      reason: "Cheer received",
    });
  }

  return { alreadyCheeredToday: false, xpAwarded: toCredit, dailyCapReached: toCredit < cheerXpAmount };
}

// The aggregate-only weekly count a learner sees about the cheers THEY
// received - never sender identity, per docs/ARCHITECTURE.md D53.
export async function getMyCheersSummary(user: { id: string }): Promise<{ receivedThisWeek: number }> {
  const weekStartUtc = istWeekStartUtc(new Date());
  const receivedThisWeek = await countCheersReceivedSince(user.id, weekStartUtc);
  return { receivedThisWeek };
}

// --- About-me chips (AR-20, docs/ARCHITECTURE.md D36) ---

// A learner can pick at most this many chips for their public profile -
// enforced here, not the schema, so the founder can change it later without
// a migration (same reasoning rewards/badges already document for their own
// admin-tunable numbers).
export const MAX_SELECTED_CHIPS = 3;

type RequestMeta = { ip: string | null; userAgent: string | null };

export async function listAboutMeChipsForAdmin() {
  return listAboutMeChips();
}

export async function createAboutMeChipForAdmin(
  actor: { id: string },
  input: AboutMeChipInput,
  meta: RequestMeta,
) {
  const created = await insertAboutMeChip({ ...input, iconKey: input.iconKey ?? null });
  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "about_me_chips.created",
    targetType: "about_me_chips",
    targetId: created.id,
    metadata: input,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return created;
}

export async function updateAboutMeChipForAdmin(
  actor: { id: string },
  id: string,
  input: AboutMeChipInput,
  meta: RequestMeta,
) {
  const previous = await getAboutMeChipById(id);
  if (!previous) throw new AppError("NOT_FOUND", "Chip not found");

  const updated = await updateAboutMeChipRow(id, { ...input, iconKey: input.iconKey ?? null });
  if (!updated) throw new AppError("NOT_FOUND", "Chip not found");

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "about_me_chips.updated",
    targetType: "about_me_chips",
    targetId: id,
    metadata: { previous: { name: previous.name, active: previous.active }, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return updated;
}

// A chip is `onDelete: "restrict"` against user_about_me_chips - deleting a
// chip currently selected by at least one learner fails loudly rather than
// silently orphaning their selection. Staff should retire a chip (active:
// false) instead of deleting one that's in use; deletion is really only for
// a chip added by mistake, never touched.
export async function deleteAboutMeChipForAdmin(actor: { id: string }, id: string, meta: RequestMeta) {
  const existing = await getAboutMeChipById(id);
  if (!existing) throw new AppError("NOT_FOUND", "Chip not found");

  try {
    await deleteAboutMeChipRow(id);
  } catch (err) {
    if (isUniqueViolation(err)) throw err; // not the expected failure mode here, surface as-is
    throw new AppError(
      "CONFLICT",
      "This chip is selected by at least one learner - turn it off (inactive) instead of deleting it",
    );
  }

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "about_me_chips.deleted",
    targetType: "about_me_chips",
    targetId: id,
    metadata: { name: existing.name },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

export async function listActiveChipsForLearner() {
  return listActiveAboutMeChips();
}

export async function getMySelectedChips(userId: string) {
  return getSelectedChipsForUser(userId);
}

export async function setMySelectedChips(
  user: { id: string },
  chipIds: string[],
  meta: RequestMeta,
): Promise<void> {
  const uniqueIds = [...new Set(chipIds)];
  if (uniqueIds.length > MAX_SELECTED_CHIPS) {
    throw new AppError("VALIDATION_FAILED", `Pick at most ${MAX_SELECTED_CHIPS} chips`);
  }

  const activeChips = await listActiveAboutMeChips();
  const activeIds = new Set(activeChips.map((c) => c.id));
  const invalid = uniqueIds.filter((id) => !activeIds.has(id));
  if (invalid.length > 0) {
    throw new AppError("VALIDATION_FAILED", "One or more chips aren't available to select");
  }

  await replaceUserChipSelection(user.id, uniqueIds);
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "about_me_chips.selection_updated",
    targetType: "user",
    targetId: user.id,
    metadata: { chipIds: uniqueIds },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

export type PublicProfileView = {
  firstName: string | null;
  lastInitial: string | null;
  level: number;
  rankTitle: LocalizedText | null;
  badges: { id: string; name: LocalizedText; description: LocalizedText; iconKey: string | null }[];
  chips: { id: string; name: LocalizedText; iconKey: string | null }[];
  weekXp: number;
  streak: { current: number; longest: number };
  quizAccuracyPct: number | null;
  currentWorld: { id: string; title: LocalizedText; completedLessons: number; totalLessons: number } | null;
};

// AR-20's public player profile bottom sheet - opened by any OTHER learner
// tapping a name/avatar anywhere in Arena. Every field here is on the
// explicit allowlist the founder confirmed at Phase 6 kickoff: kid-safe
// display name, level, rank title, badges, chips, week XP, streak, quiz
// accuracy, current world + completion. Never: email, phone, DOB, state,
// parent info, school/class, or `bio` (docs/ARCHITECTURE.md D36 - bio stays
// on GET/PATCH /me forever, never surfaced here or anywhere else).
export async function getPublicProfile(targetUserId: string): Promise<PublicProfileView> {
  const target = await findCheerableUser(targetUserId); // same shape needed: id + not-deleted
  if (!target || target.deletedAt) throw new AppError("NOT_FOUND", "Learner not found");

  const weekStartUtc = istWeekStartUtc(new Date());
  const [nameRows, levelInfo, streakStats, quizAccuracy, badges, chips, currentWorldId, weekXp] =
    await Promise.all([
      getDisplayNamesForUserIds([targetUserId]),
      getLevelInfo(targetUserId),
      getStreakStats(targetUserId),
      getQuizAccuracyTotalsForUser(targetUserId),
      getMyBadges(targetUserId),
      getSelectedChipsForUser(targetUserId),
      getCurrentWorldIdForUser(targetUserId),
      sumXpSince(targetUserId, weekStartUtc),
    ]);

  const name = nameRows.get(targetUserId) ?? { firstName: null, lastInitial: null };
  const rankTitleRow = await getRankTitleForLevel(levelInfo.level);

  let currentWorld: PublicProfileView["currentWorld"] = null;
  if (currentWorldId) {
    const title = await getWorldTitleById(currentWorldId);
    if (title) {
      const [completedLessons, totalLessons] = await Promise.all([
        countCompletedLessonsForUserInWorld(targetUserId, currentWorldId),
        countPublishedLessonsInWorld(currentWorldId),
      ]);
      currentWorld = { id: currentWorldId, title, completedLessons, totalLessons };
    }
  }

  return {
    firstName: name.firstName,
    lastInitial: name.lastInitial,
    level: levelInfo.level,
    rankTitle: rankTitleRow?.title ?? null,
    badges: badges
      .filter((b) => b.unlocked)
      .map((b) => ({ id: b.id, name: b.name, description: b.description, iconKey: b.iconKey })),
    chips: chips.map((c) => ({ id: c.id, name: c.name, iconKey: c.iconKey })),
    weekXp,
    streak: { current: streakStats.learning.current, longest: streakStats.learning.longest },
    quizAccuracyPct:
      quizAccuracy.total > 0 ? Math.round((quizAccuracy.correct / quizAccuracy.total) * 100) : null,
    currentWorld,
  };
}
