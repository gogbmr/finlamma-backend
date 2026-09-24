import { describe, expect, it, vi } from "vitest";

const mockCountCompletedLessonsForUser = vi.fn();
vi.mock("@/server/lesson-progress/repo", () => ({
  countCompletedLessonsForUser: (userId: unknown) => mockCountCompletedLessonsForUser(userId),
}));

const mockGetQuizAccuracyTotalsForUser = vi.fn();
vi.mock("@/server/quiz-attempts/repo", () => ({
  getQuizAccuracyTotalsForUser: (userId: unknown) => mockGetQuizAccuracyTotalsForUser(userId),
}));

const mockGetStreakStats = vi.fn();
vi.mock("@/server/streaks/service", () => ({
  getStreakStats: (userId: unknown) => mockGetStreakStats(userId),
}));

import { BADGE_CRITERIA_EVALUATORS } from "./evaluators";

const USER_ID = "user_1";

describe("lessons_completed evaluator", () => {
  it("returns the lifetime completed-lesson count", async () => {
    mockCountCompletedLessonsForUser.mockResolvedValueOnce(12);

    expect(await BADGE_CRITERIA_EVALUATORS.lessons_completed(USER_ID)).toBe(12);
  });
});

describe("streak_days evaluator", () => {
  it("returns the longest-ever learning streak, not the current one", async () => {
    mockGetStreakStats.mockResolvedValueOnce({
      learning: { current: 2, longest: 20, freezesLeft: 1 },
      pulseCheck: { current: 0, longest: 0, freezesLeft: 2 },
    });

    expect(await BADGE_CRITERIA_EVALUATORS.streak_days(USER_ID)).toBe(20);
  });
});

describe("quiz_accuracy_pct evaluator", () => {
  it("computes a rounded percentage", async () => {
    mockGetQuizAccuracyTotalsForUser.mockResolvedValueOnce({ correct: 2, total: 3 });

    expect(await BADGE_CRITERIA_EVALUATORS.quiz_accuracy_pct(USER_ID)).toBe(67);
  });

  it("returns 0 before any graded question is answered", async () => {
    mockGetQuizAccuracyTotalsForUser.mockResolvedValueOnce({ correct: 0, total: 0 });

    expect(await BADGE_CRITERIA_EVALUATORS.quiz_accuracy_pct(USER_ID)).toBe(0);
  });
});
