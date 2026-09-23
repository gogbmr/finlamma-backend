import type { users } from "@/db/schema";
import { getLevelInfo } from "@/server/leveling/service";
import { getRankTitleForLevel } from "@/server/rank-titles/service";

type UserRow = typeof users.$inferSelect;

// PR-01/PR-02 (Profile - Overview): identity (kid-safe first name + last
// initial, per CLAUDE.md rule 10 - never a photo, never a full last name)
// plus level/XP-progress plus the rank title that level currently
// qualifies for. Percentile/rank is deliberately omitted - deferred to
// Phase 6, once Arena's weekly leaderboard snapshot exists to read it from
// (docs/FEATURE_MAP.md's PR-03).
export async function getProfileOverview(user: UserRow) {
  const levelInfo = await getLevelInfo(user.id);
  const rankTitleRow = await getRankTitleForLevel(levelInfo.level);

  return {
    firstName: user.firstName,
    lastInitial: user.lastInitial,
    joinedAt: user.createdAt,
    level: levelInfo.level,
    totalXp: levelInfo.totalXp,
    xpIntoLevel: levelInfo.xpIntoLevel,
    xpToNextLevel: levelInfo.xpToNextLevel,
    rankTitle: rankTitleRow?.title ?? null,
  };
}
