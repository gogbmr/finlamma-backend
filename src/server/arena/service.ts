import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { istDateString, istWeekStartDate, istWeekStartUtc } from "@/lib/ist-date";
import { getSettingJson, getSettingNumber, setSettingJson } from "@/lib/settings";
import { AppError } from "@/lib/errors";
import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { insertVmoneyLedgerEntryIfNew, insertXpEventIfNew, sumXpSince } from "@/server/economy/repo";
import { VM_TO_LEDGER_PAISE } from "@/server/economy/schemas";
import { getVmIssuanceMultiplier } from "@/server/economy/service";
import { getLevelInfo } from "@/server/leveling/service";
import { getQuizAccuracyTotalsForUser } from "@/server/quiz-attempts/repo";
import { getRankTitleForLevel } from "@/server/rank-titles/service";
import { getStreakStats } from "@/server/streaks/service";
import { getMyBadges } from "@/server/badges/service";
import { insertUserBadgeIfAbsent } from "@/server/badges/repo";
import { isUniqueViolation } from "@/lib/db-errors";
import { NOTIFICATION_COPY } from "@/server/notifications/copy";
import { notifyUser } from "@/server/notifications/service";
import { INDIAN_STATES } from "@/server/shared/schemas";
import type { LocalizedText } from "@/db/schema/_helpers";
import type { AboutMeChipInput, ArenaLeagueSettingsInput } from "./schemas";
import type { SnapshotEntry } from "./repo";
import {
  countCheersReceivedSince,
  countCompletedLessonsForUserInWorld,
  countPublishedLessonsInWorld,
  deleteAboutMeChipRow,
  ensureLeague,
  findCheerableUser,
  getAboutMeChipById,
  getCurrentWorldIdForUser,
  getDisplayNamesForUserIds,
  getLastWeekRanksForScope,
  getLeagueZonesForScope,
  getSelectedChipsForUser,
  getSnapshotEntryForUser,
  getWorldTitleById,
  getWorldXpSparklines,
  insertAboutMeChip,
  insertCheerIfNew,
  insertLeagueSettlementIfNew,
  listActiveAboutMeChips,
  listAboutMeChips,
  listPublishedWorldsOrdered,
  listRecentXpEvents,
  replaceLeagueMembers,
  replaceUserChipSelection,
  sumCheerXpCreditedToday,
  sumCheerXpFromSenderToReceiverSince,
  updateAboutMeChipRow,
  upsertLeaderboardSnapshotIfNew,
  weeklyXpByScope,
  xpByWorldInRange,
} from "./repo";
import { encodeScope, resolveScopeForRequest, type ArenaScope } from "./scope";

type LeagueZone = "promote" | "safe" | "demote";

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

// docs/ARCHITECTURE.md D56: closes a gap the daily cap above doesn't - two
// accounts cheering each other every single day would still net up to
// 7x`arena_cheer_xp_amount` from that one relationship alone. Default 15 =
// three cheers' worth at the default per-cheer amount, so sustained
// day-after-day cheering between the same two accounts stops paying out
// partway through the week without cutting off normal cheering.
export const CHEER_WEEKLY_SENDER_RECEIVER_CAP_KEY = "arena_cheer_weekly_sender_receiver_cap";
export const DEFAULT_CHEER_WEEKLY_SENDER_RECEIVER_CAP = 15;

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
  zone: LeagueZone | null;
  // AR-09's weekly move indicator (▲▼—): positive = moved up N ranks since
  // last week's settlement, negative = moved down, null = nothing to compare
  // against (a new entrant this week, or the scope didn't settle last week -
  // e.g. it was below the D52 privacy floor). Computed from the same
  // leaderboard_snapshots row getMyArenaRankSummary's rankDelta cells already
  // read, just against THIS scope's live rows instead of a single user.
  rankDelta: number | null;
};

// docs/ARCHITECTURE.md D54: promotion (and the neutral "safe" band) are
// visible on anyone's row; demotion is visible only on the viewer's OWN
// row. `zone` here is this scope's CURRENT league_members state (as of the
// last settlement), not necessarily the zone Checkpoint 3 actually paid -
// see league_settlements for the single best-zone-per-week payout record.
function visibleZone(zone: LeagueZone | undefined, isSelf: boolean): LeagueZone | null {
  if (!zone) return null;
  if (isSelf) return zone;
  return zone === "demote" ? null : zone;
}

export type LeaderboardView = {
  requestedScope: string;
  scope: string;
  fallbackApplied: boolean;
  notEnoughPlayers: boolean;
  weekStartDate: string;
  poolSize: number;
  rows: LeaderboardRowView[];
  self: { rank: number; xp: number; rankDelta: number | null } | null;
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
  const zones = await getLeagueZonesForScope(encodeScope(resolution.resolved));
  // AR-09: last week's settled rank for this same (resolved) scope, keyed by
  // user - a plain lookup against leaderboard_snapshots (empty map if that
  // scope didn't settle last week, e.g. it was below the D52 privacy floor).
  const previousWeekStartDate = istWeekStartDate(new Date(weekStartUtc.getTime() - 7 * 24 * 60 * 60 * 1000));
  const prevRanks = await getLastWeekRanksForScope(encodeScope(resolution.resolved), previousWeekStartDate);
  const rankDeltaFor = (userId: string, rank: number): number | null => {
    const prevRank = prevRanks.get(userId);
    return prevRank !== undefined ? prevRank - rank : null;
  };
  const selfRanked = ranked.find((r) => r.userId === user.id) ?? null;
  const topRows = ranked.slice(0, LEADERBOARD_ROW_LIMIT);
  const selfInTop = topRows.some((r) => r.userId === user.id);

  const viewRows: LeaderboardRowView[] = topRows.map((r) => {
    const name = names.get(r.userId);
    const isSelf = r.userId === user.id;
    return {
      rank: r.rank,
      userId: r.userId,
      firstName: name?.firstName ?? null,
      lastInitial: name?.lastInitial ?? null,
      xp: r.xp,
      isSelf,
      zone: visibleZone(zones.get(r.userId), isSelf),
      rankDelta: rankDeltaFor(r.userId, r.rank),
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
      zone: visibleZone(zones.get(selfRanked.userId), true),
      rankDelta: rankDeltaFor(selfRanked.userId, selfRanked.rank),
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
    self: selfRanked
      ? { rank: selfRanked.rank, xp: selfRanked.xp, rankDelta: rankDeltaFor(selfRanked.userId, selfRanked.rank) }
      : null,
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
  const weekStartUtc = istWeekStartUtc(new Date());
  const [cheerXpAmount, dailyCap, weeklyPairCap] = await Promise.all([
    getSettingNumber(CHEER_XP_AMOUNT_KEY, DEFAULT_CHEER_XP_AMOUNT),
    getSettingNumber(CHEER_DAILY_XP_CAP_KEY, DEFAULT_CHEER_DAILY_XP_CAP),
    getSettingNumber(CHEER_WEEKLY_SENDER_RECEIVER_CAP_KEY, DEFAULT_CHEER_WEEKLY_SENDER_RECEIVER_CAP),
  ]);

  // Locks the RECEIVER's row before reading or crediting anything, so two
  // concurrent cheers from DIFFERENT senders to the SAME receiver can never
  // both read the daily cap as "not yet reached" and both credit past it -
  // same lock-then-check idiom claimRewardTx/finishAttemptTx already use
  // (docs/ARCHITECTURE.md D30). The weekly per-sender-receiver cap (D56) was
  // already race-safe on its own (the cheers table's own unique index
  // serializes any two cheers from the SAME pair), but that index can't
  // protect the daily per-receiver cap against DISTINCT senders arriving at
  // the same instant - a security-audit finding, Phase 6 audit 2026-09-29.
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${users} where id = ${receiverId} for update`);

    const cheerRow = await insertCheerIfNew(sender.id, receiverId, todayIst, tx);
    if (!cheerRow) {
      return { alreadyCheeredToday: true as const, xpAwarded: 0, dailyCapReached: false, cheerId: null };
    }

    const [alreadyCreditedToday, alreadyCreditedThisPairThisWeek] = await Promise.all([
      sumCheerXpCreditedToday(receiverId, todayIst, tx),
      sumCheerXpFromSenderToReceiverSince(sender.id, receiverId, weekStartUtc, tx),
    ]);
    const remainingDaily = Math.max(0, dailyCap - alreadyCreditedToday);
    const remainingWeeklyPair = Math.max(0, weeklyPairCap - alreadyCreditedThisPairThisWeek);
    const toCredit = Math.min(cheerXpAmount, remainingDaily, remainingWeeklyPair);

    if (toCredit > 0) {
      await insertXpEventIfNew(tx, {
        userId: receiverId,
        amount: toCredit,
        sourceType: "cheer",
        sourceId: cheerRow.id,
        ruleId: null,
        reason: "Cheer received",
      });
    }

    // Named for the common case, but also true when D56's weekly per-pair
    // cap (not just the receiver's daily cap) reduced the award - the app
    // shows one generic "capped" message either way, so one boolean is enough.
    return {
      alreadyCheeredToday: false as const,
      xpAwarded: toCredit,
      dailyCapReached: toCredit < cheerXpAmount,
      cheerId: cheerRow.id,
    };
  });

  if (result.alreadyCheeredToday) {
    return { alreadyCheeredToday: true, xpAwarded: 0, dailyCapReached: false };
  }

  await logActivity({
    actorType: "user",
    actorId: sender.id,
    action: "arena.cheer_sent",
    targetType: "user",
    targetId: receiverId,
    metadata: { cheerId: result.cheerId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  // docs/ROADMAP.md's Phase 6 note: cheers already awarded XP but skipped
  // the push because notifications infra didn't exist yet - closed here.
  // Fires whenever a NEW cheer landed (not a same-day duplicate), even if
  // the daily XP cap zeroed the actual award - the social signal is real
  // either way. Never names the sender (D53). Always awaited (never
  // fire-and-forget) - a Vercel serverless invocation isn't guaranteed to
  // keep running background work after the response is sent, and
  // notifyUser itself never throws (see its own doc comment), so awaiting
  // it costs correctness nothing.
  await notifyUser(receiverId, "cheer_received", NOTIFICATION_COPY.cheer_received);

  return { alreadyCheeredToday: false, xpAwarded: result.xpAwarded, dailyCapReached: result.dailyCapReached };
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

// --- League settlement (Phase 6 Checkpoint 3, docs/ARCHITECTURE.md D55/D56) ---

export const ARENA_PROMOTE_VM_REWARD_KEY = "arena_promote_vm_reward";
export const DEFAULT_ARENA_PROMOTE_VM_REWARD = 500; // prototype-sourced, unchanged
export const ARENA_SAFE_VM_REWARD_KEY = "arena_safe_vm_reward";
export const DEFAULT_ARENA_SAFE_VM_REWARD = 0; // D55: departs from the prototype's 150, by design
export const ARENA_LEAGUE_WEEKLY_VM_CAP_KEY = "arena_league_weekly_vm_cap";
export const DEFAULT_ARENA_LEAGUE_WEEKLY_VM_CAP = 500;
// Points at a real row in the existing badge catalog (admin-created via the
// normal badge editor, criteria.type "external") - null until an admin sets
// one up, in which case settlement pays VM but skips the crest rather than
// failing the whole payout over a missing configuration.
export const ARENA_CREST_BADGE_ID_KEY = "arena_crest_badge_id";

const ZONE_VALUE: Record<LeagueZone, number> = { promote: 2, safe: 1, demote: 0 };

// Pure and exported for direct testing - the prototype's own formula
// (`Finlamma App.dc.html` L6229: `Math.max(1, Math.round(n/4))` for both the
// promote and demote zone sizes), unchanged.
export function computeZonesForRankedList(
  ranked: { userId: string; rank: number }[],
): Map<string, LeagueZone> {
  const n = ranked.length;
  const zoneN = Math.max(1, Math.round(n / 4));
  const map = new Map<string, LeagueZone>();
  ranked.forEach((r, i) => {
    map.set(r.userId, i < zoneN ? "promote" : i >= n - zoneN ? "demote" : "safe");
  });
  return map;
}

type BestZoneEntry = { scope: string; zone: LeagueZone; xp: number };

// Every scope that could conceivably have a league this week - every
// published world, every Indian state (a fixed, small, bounded list - see
// src/server/shared/schemas.ts), plus india/global. A scope below the
// privacy floor (docs/ARCHITECTURE.md D52) is simply skipped entirely below,
// not just hidden from display - the floor gates whether a scope pays out
// at all, not only whether its ladder renders.
async function allCandidateScopes(): Promise<ArenaScope[]> {
  const worlds = await listPublishedWorldsOrdered();
  return [
    { kind: "india" as const },
    { kind: "global" as const },
    ...INDIAN_STATES.map((state) => ({ kind: "state" as const, state })),
    ...worlds.map((w) => ({ kind: "world" as const, worldId: w.id })),
  ];
}

// Runs weekly (src/inngest/functions/arena-league-settlement.ts, Monday
// 00:30 IST) against the week that just ended. Two phases: (1) per scope,
// rank + assign zones + persist league_members/leaderboard_snapshots -
// every scope that meets the floor, independent of who gets paid; (2) per
// learner, pick their single BEST-qualifying zone across every scope they
// were ranked in this week (docs/ARCHITECTURE.md D55 - never summed) and pay
// it once, idempotently (league_settlements' own unique index is what makes
// a retried run a no-op, not an app-level "already paid?" check).
export async function settleArenaLeaguesForWeek(): Promise<{
  weekStartDate: string;
  scopesSettled: number;
  usersSettled: number;
}> {
  const now = new Date();
  const weekEndUtc = istWeekStartUtc(now); // start of the CURRENT week = exclusive end of the one just closed
  const weekStartUtc = new Date(weekEndUtc.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStartDate = istWeekStartDate(weekStartUtc);
  const previousWeekStartDate = istWeekStartDate(new Date(weekStartUtc.getTime() - 7 * 24 * 60 * 60 * 1000));

  const [promoteVm, safeVm, weeklyCap, minPoolSize, multiplier, crestBadgeIdRaw, scopes] = await Promise.all([
    getSettingNumber(ARENA_PROMOTE_VM_REWARD_KEY, DEFAULT_ARENA_PROMOTE_VM_REWARD),
    getSettingNumber(ARENA_SAFE_VM_REWARD_KEY, DEFAULT_ARENA_SAFE_VM_REWARD),
    getSettingNumber(ARENA_LEAGUE_WEEKLY_VM_CAP_KEY, DEFAULT_ARENA_LEAGUE_WEEKLY_VM_CAP),
    getSettingNumber(ARENA_MIN_LEADERBOARD_POOL_SIZE_KEY, DEFAULT_ARENA_MIN_LEADERBOARD_POOL_SIZE),
    getVmIssuanceMultiplier(),
    getSettingJson(ARENA_CREST_BADGE_ID_KEY),
    allCandidateScopes(),
  ]);
  const crestBadgeId = typeof crestBadgeIdRaw === "string" ? crestBadgeIdRaw : null;

  const bestByUser = new Map<string, BestZoneEntry>();
  let scopesSettled = 0;

  for (const scope of scopes) {
    const encoded = encodeScope(scope);
    const rows = await weeklyXpByScope(scope, weekStartUtc, weekEndUtc);
    if (rows.length < minPoolSize) continue; // D52: below the floor, this scope doesn't settle at all

    const ranked = rankRows(rows);
    const zones = computeZonesForRankedList(ranked);
    const prevRanks = await getLastWeekRanksForScope(encoded, previousWeekStartDate);
    const league = await ensureLeague(encoded);

    await replaceLeagueMembers(
      league.id,
      ranked.map((r) => ({ userId: r.userId, zone: zones.get(r.userId)!, rank: r.rank })),
    );
    await upsertLeaderboardSnapshotIfNew({
      weekStartDate,
      scope: encoded,
      poolSize: ranked.length,
      rankings: ranked.map((r) => ({
        userId: r.userId,
        rank: r.rank,
        xp: r.xp,
        zone: zones.get(r.userId)!,
        prevRank: prevRanks.get(r.userId) ?? null,
      })),
    });
    scopesSettled++;

    for (const r of ranked) {
      const zone = zones.get(r.userId)!;
      const existing = bestByUser.get(r.userId);
      if (!existing || ZONE_VALUE[zone] > ZONE_VALUE[existing.zone]) {
        bestByUser.set(r.userId, { scope: encoded, zone, xp: r.xp });
      }
    }
  }

  let usersSettled = 0;
  for (const [userId, best] of bestByUser) {
    const nominal = best.zone === "promote" ? promoteVm : best.zone === "safe" ? safeVm : 0;
    const vmAwarded = Math.min(Math.round(nominal * multiplier), weeklyCap);

    const paid = await db.transaction(async (tx) => {
      const settlement = await insertLeagueSettlementIfNew(tx, {
        userId,
        weekStartDate,
        scope: best.scope,
        zone: best.zone,
        xp: best.xp,
        vmAwarded,
      });
      if (!settlement) return false; // already settled this week - no-op

      if (vmAwarded > 0) {
        await insertVmoneyLedgerEntryIfNew(tx, {
          userId,
          amountPaise: vmAwarded * VM_TO_LEDGER_PAISE,
          sourceType: "arena_league_reward",
          sourceId: settlement.id,
          ruleId: null,
          multiplierApplied: multiplier,
          reason: `Arena ${best.zone} zone reward (week of ${weekStartDate})`,
        });
      }
      if (best.zone === "promote" && crestBadgeId) {
        await insertUserBadgeIfAbsent(userId, crestBadgeId, tx);
      }
      return true;
    });
    if (paid) {
      usersSettled++;
      // Only the promote zone - never safe/demote, so this notification is
      // always a celebration, never a comparison a learner could feel bad
      // about (Phase 7 kickoff decision). Only fires for a NEW settlement
      // (`paid`), never a retried/idempotent replay of an already-settled
      // week.
      if (best.zone === "promote") {
        await notifyUser(userId, "league_rank_change", NOTIFICATION_COPY.league_rank_change);
      }
    }
  }

  return { weekStartDate, scopesSettled, usersSettled };
}

// Admin editor (`/admin/settings`, settings.manage) for every settlement
// tunable at once - staff see and change these as one form, same as every
// other grouped settings_kv editor in this codebase.
export async function getArenaLeagueSettingsForAdmin(): Promise<ArenaLeagueSettingsInput> {
  const [promoteVmReward, safeVmReward, weeklyVmCap, cheerWeeklySenderReceiverCap, crestBadgeIdRaw] =
    await Promise.all([
      getSettingNumber(ARENA_PROMOTE_VM_REWARD_KEY, DEFAULT_ARENA_PROMOTE_VM_REWARD),
      getSettingNumber(ARENA_SAFE_VM_REWARD_KEY, DEFAULT_ARENA_SAFE_VM_REWARD),
      getSettingNumber(ARENA_LEAGUE_WEEKLY_VM_CAP_KEY, DEFAULT_ARENA_LEAGUE_WEEKLY_VM_CAP),
      getSettingNumber(CHEER_WEEKLY_SENDER_RECEIVER_CAP_KEY, DEFAULT_CHEER_WEEKLY_SENDER_RECEIVER_CAP),
      getSettingJson(ARENA_CREST_BADGE_ID_KEY),
    ]);
  return {
    promoteVmReward,
    safeVmReward,
    weeklyVmCap,
    cheerWeeklySenderReceiverCap,
    crestBadgeId: typeof crestBadgeIdRaw === "string" ? crestBadgeIdRaw : null,
  };
}

export async function updateArenaLeagueSettingsForAdmin(
  actor: { id: string },
  input: ArenaLeagueSettingsInput,
  meta: RequestMeta,
): Promise<ArenaLeagueSettingsInput> {
  const previous = await getArenaLeagueSettingsForAdmin();

  await Promise.all([
    setSettingJson(ARENA_PROMOTE_VM_REWARD_KEY, input.promoteVmReward, "Arena league promote-zone weekly VM reward"),
    setSettingJson(ARENA_SAFE_VM_REWARD_KEY, input.safeVmReward, "Arena league safe-zone weekly VM reward"),
    setSettingJson(ARENA_LEAGUE_WEEKLY_VM_CAP_KEY, input.weeklyVmCap, "Arena league weekly VM cap per learner"),
    setSettingJson(
      CHEER_WEEKLY_SENDER_RECEIVER_CAP_KEY,
      input.cheerWeeklySenderReceiverCap,
      "Arena cheers: weekly XP cap per sender-receiver pair",
    ),
    setSettingJson(ARENA_CREST_BADGE_ID_KEY, input.crestBadgeId, "Badge id awarded for the Arena promote-zone crest"),
  ]);

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "arena.league_settings_updated",
    targetType: "settings_kv",
    targetId: "arena_league_settings",
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}

// --- Percentile/rank wiring (Phase 6 Checkpoint 6, PR-01/03/30) ---

export type ScopeRankInfo = {
  scope: string;
  rank: number;
  poolSize: number;
  // "Top N%" framing (smaller is better), matching the prototype's own
  // notification copy ("Top 8% mein aa gaye!") - never 0, a rank-1 learner
  // in a huge pool still reads as "top 1%", not "top 0%".
  topPercentPct: number;
  // Positive = moved toward rank 1 (improved) since last week; null when
  // there's no prior week's entry to compare against (first time settled,
  // or the scope didn't settle last week).
  rankDelta: number | null;
};

export type ArenaRankSummary = {
  world: ScopeRankInfo | null;
  stateOrIndia: ScopeRankInfo | null;
  global: ScopeRankInfo | null;
};

function shapeSnapshotEntry(entry: SnapshotEntry | null, scope: string): ScopeRankInfo | null {
  if (!entry) return null;
  return {
    scope,
    rank: entry.rank,
    poolSize: entry.poolSize,
    topPercentPct: Math.max(1, Math.ceil((entry.rank / entry.poolSize) * 100)),
    rankDelta: entry.prevRank !== null ? entry.prevRank - entry.rank : null,
  };
}

// PR-01's headline "percentile", PR-03's three rank-delta cells (World /
// State-or-India / Global) and PR-30's report-card "global rank" all read
// from here - one shared lookup against the last WEEKLY SETTLEMENT
// (src/inngest/functions/arena-league-settlement.ts), never a live
// aggregate. Each cell is null, cleanly, in every case that isn't a real
// rank: the scope never settled (too new, or below the D52 privacy floor
// that week - a below-floor scope never gets a leaderboard_snapshots row at
// all), or the learner had no XP that week even though the scope settled
// for others. Never a fabricated 0 or a broken partial state.
//
// Known, accepted imprecision (same spirit as D43/D44's documented
// simplifications elsewhere): "world" uses the learner's CURRENT world
// (today), not necessarily the world they were actually ranked in during
// last week's settlement - a learner who has since advanced to a new world
// simply reads world: null until settlement next runs under their new
// world. Nothing tracks "which world was I in as of last Monday," and nothing
// needs to for this to be honest (null, not wrong).
export async function getMyArenaRankSummary(user: { id: string; state: string | null }): Promise<ArenaRankSummary> {
  const lastSettledWeekStartUtc = new Date(istWeekStartUtc(new Date()).getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStartDate = istWeekStartDate(lastSettledWeekStartUtc);

  const worldId = await getCurrentWorldIdForUser(user.id);
  const worldScope = worldId ? encodeScope({ kind: "world", worldId }) : null;
  const globalScope = encodeScope({ kind: "global" });
  const indiaScope = encodeScope({ kind: "india" });
  const stateScope = user.state ? encodeScope({ kind: "state", state: user.state }) : null;

  const [worldEntry, globalEntry, stateEntry] = await Promise.all([
    worldScope ? getSnapshotEntryForUser(worldScope, weekStartDate, user.id) : Promise.resolve(null),
    getSnapshotEntryForUser(globalScope, weekStartDate, user.id),
    stateScope ? getSnapshotEntryForUser(stateScope, weekStartDate, user.id) : Promise.resolve(null),
  ]);

  // State-or-India (PR-03): prefer the state entry when one genuinely
  // exists; otherwise fall back to India - the same fallback shape GET
  // /arena/leaderboard already uses, for the same reason (a learner with no
  // state set, or whose thin state scope didn't settle, has nothing
  // state-specific to show).
  let stateOrIndiaEntry = stateEntry;
  let stateOrIndiaScope = stateScope ?? indiaScope;
  if (!stateOrIndiaEntry) {
    stateOrIndiaEntry = await getSnapshotEntryForUser(indiaScope, weekStartDate, user.id);
    stateOrIndiaScope = indiaScope;
  }

  return {
    world: worldScope ? shapeSnapshotEntry(worldEntry, worldScope) : null,
    stateOrIndia: shapeSnapshotEntry(stateOrIndiaEntry, stateOrIndiaScope),
    global: shapeSnapshotEntry(globalEntry, globalScope),
  };
}
