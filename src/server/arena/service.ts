import { istWeekStartDate, istWeekStartUtc } from "@/lib/ist-date";
import { getSettingNumber } from "@/lib/settings";
import {
  getCurrentWorldIdForUser,
  getDisplayNamesForUserIds,
  weeklyXpByScope,
} from "./repo";
import { encodeScope, resolveScopeForRequest, type ArenaScope } from "./scope";

export const ARENA_MIN_LEADERBOARD_POOL_SIZE_KEY = "arena_min_leaderboard_pool_size";
export const DEFAULT_ARENA_MIN_LEADERBOARD_POOL_SIZE = 20;

// The number of ranked rows returned outright - AR-06/AR-10 also want the
// caller's own row even when it falls outside this window, handled
// separately below as `self`.
const LEADERBOARD_ROW_LIMIT = 50;

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

export async function getLeaderboard(
  user: { id: string; state: string | null },
  requestedKind: "world" | "state" | "india" | "global",
): Promise<LeaderboardView> {
  const now = new Date();
  const weekStartUtc = istWeekStartUtc(now);
  const weekStartDate = istWeekStartDate(now);
  const minPoolSize = await getSettingNumber(
    ARENA_MIN_LEADERBOARD_POOL_SIZE_KEY,
    DEFAULT_ARENA_MIN_LEADERBOARD_POOL_SIZE,
  );

  const requested = await requestedScopeForUser(user.id, requestedKind, user.state);
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
