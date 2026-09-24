import { countCompletedLessonsForUser } from "@/server/lesson-progress/repo";
import { getQuizAccuracyTotalsForUser } from "@/server/quiz-attempts/repo";
import { getStreakStats } from "@/server/streaks/service";
import type { BadgeCriteria } from "./schemas";

export type BadgeCriteriaEvaluator = (userId: string) => Promise<number>;

// Each evaluator returns the learner's current lifetime progress toward a
// criteria type - the caller compares it against the badge's own threshold.
// This is a LIFETIME/cumulative scope, unlike src/server/daily-goals's
// "today only" evaluators - different data scope, same "evaluator in code"
// shape. Adding a new criteria type means adding a case here AND to
// src/server/badges/schemas.ts's BadgeCriteriaTypeEnum. Trading/news
// criteria types don't exist yet (those domains aren't built) - a "Trading"/
// "News" CATEGORY badge (the display taxonomy) can still exist today using
// one of these three criteria types; it just can't use a trading/news
// criteria type until Phase 4/5 add one.
export const BADGE_CRITERIA_EVALUATORS: Record<BadgeCriteria["type"], BadgeCriteriaEvaluator> = {
  lessons_completed: (userId) => countCompletedLessonsForUser(userId),

  streak_days: async (userId) => {
    const stats = await getStreakStats(userId);
    return stats.learning.longest;
  },

  quiz_accuracy_pct: async (userId) => {
    const { correct, total } = await getQuizAccuracyTotalsForUser(userId);
    return total > 0 ? Math.round((correct / total) * 100) : 0;
  },
};
