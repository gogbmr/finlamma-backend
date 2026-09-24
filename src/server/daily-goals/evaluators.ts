import { istDateStartUtc } from "@/lib/ist-date";
import { listLessonCompletionTimestampsForUser } from "@/server/lesson-progress/repo";
import { getTodaySessionSeconds } from "@/server/session-time/service";
import type { DailyGoalType } from "./schemas";

export type DailyGoalEvaluator = (userId: string, at: Date) => Promise<number>;

// Each evaluator returns today's raw progress count for its type - the
// service layer compares this against the admin-set target. Adding a new
// goal type means adding an evaluator here AND a case in
// src/server/daily-goals/schemas.ts's DailyGoalTypeEnum; which types are
// ACTIVE and their targets stay entirely in settings_kv data (see
// DEFAULT_DAILY_GOALS's comment).
export const DAILY_GOAL_EVALUATORS: Record<DailyGoalType, DailyGoalEvaluator> = {
  study_minutes: async (userId, at) => Math.floor((await getTodaySessionSeconds(userId, at)) / 60),

  // Reuses PR-08's own data source (lesson_progress.completedAt) - passing
  // istDateStartUtc(at) as `since` means every row this returns already IS
  // today (IST), so the count is just the array length.
  lesson_completed: async (userId, at) =>
    (await listLessonCompletionTimestampsForUser(userId, istDateStartUtc(at))).length,

  // Phase 5 (Pulse Check) doesn't exist yet - inactive by default
  // (DEFAULT_DAILY_GOALS), so this only ever runs if staff manually flips it
  // on early. Returns 0 rather than throwing, so doing that is merely
  // useless, never a crash.
  pulse_check: async () => 0,
};
