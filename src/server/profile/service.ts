import type { users } from "@/db/schema";
import {
  DB_CONCURRENCY_LIMIT,
  runWithConcurrencyLimit,
} from "@/lib/concurrency-limit";
import { istDateString } from "@/lib/ist-date";
import { getMyArenaRankSummary } from "@/server/arena/service";
import { getLevelInfo } from "@/server/leveling/service";
import {
  countCompletedLessonsForUser,
  listLessonCompletionTimestampsForUser,
} from "@/server/lesson-progress/repo";
import { countPublishedLessons } from "@/server/lessons/repo";
import { getQuizAccuracyTotalsForUser } from "@/server/quiz-attempts/repo";
import { getRankTitleForLevel } from "@/server/rank-titles/service";
import { getStreakStats } from "@/server/streaks/service";

type UserRow = typeof users.$inferSelect;

const ACTIVITY_DOT_CALENDAR_DAYS = 7;

// PR-08: the last N IST calendar dates (oldest first) with whether the user
// completed any lesson that day - see listLessonCompletionTimestampsForUser's
// comment for why "completed a lesson" (not per-question step) is the
// activity signal here.
function buildActivityDotCalendar(
  completionTimestamps: Date[],
  at: Date,
  days: number,
) {
  const activeDates = new Set(
    completionTimestamps.map((d) => istDateString(d)),
  );
  const calendar: { date: string; active: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = istDateString(
      new Date(at.getTime() - i * 24 * 60 * 60 * 1000),
    );
    calendar.push({ date, active: activeDates.has(date) });
  }
  return calendar;
}

// PR-01/02/05/06/07/08 (Profile - Overview): identity (kid-safe first name +
// last initial, per CLAUDE.md rule 10 - never a photo, never a full last
// name), level/XP-progress, the rank title that level currently qualifies
// for, the learning streak, lesson-completion progress, quiz accuracy and a
// 7-day activity dot calendar. Percentile (PR-01) and the three rank-delta
// cells (PR-03) read from Arena's last weekly settlement
// (src/server/arena/service.ts's getMyArenaRankSummary) - each is null,
// cleanly, whenever there's genuinely nothing to report (no settlement yet,
// a scope below the privacy floor, or no XP that week), never a fabricated
// 0 or a broken partial state.
export async function getProfileOverview(user: UserRow, at: Date = new Date()) {
  const since = new Date(
    at.getTime() - (ACTIVITY_DOT_CALENDAR_DAYS - 1) * 24 * 60 * 60 * 1000,
  );
  const [
    levelInfo,
    streakStats,
    completedLessons,
    totalLessons,
    quizAccuracy,
    recentCompletions,
    rankSummary,
  ] = await runWithConcurrencyLimit(
    [
      () => getLevelInfo(user.id),
      () => getStreakStats(user.id, at),
      () => countCompletedLessonsForUser(user.id),
      () => countPublishedLessons(),
      () => getQuizAccuracyTotalsForUser(user.id),
      () => listLessonCompletionTimestampsForUser(user.id, since),
      () => getMyArenaRankSummary(user),
    ],
    DB_CONCURRENCY_LIMIT,
  );
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
    // PR-01's headline stat - the Global scope's "top N%", or null if Arena
    // hasn't settled a week for this learner yet.
    percentile: rankSummary.global?.topPercentPct ?? null,
    // PR-03's three rank-delta cells.
    rankDeltaCells: rankSummary,
    streak: {
      current: streakStats.learning.current,
      longest: streakStats.learning.longest,
      freezesLeft: streakStats.learning.freezesLeft,
    },
    lessons: {
      completed: completedLessons,
      total: totalLessons,
      pct:
        totalLessons > 0
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0,
    },
    quizAccuracyPct:
      quizAccuracy.total > 0
        ? Math.round((quizAccuracy.correct / quizAccuracy.total) * 100)
        : null,
    activityDotCalendar: buildActivityDotCalendar(
      recentCompletions,
      at,
      ACTIVITY_DOT_CALENDAR_DAYS,
    ),
  };
}
