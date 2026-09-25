import { describe, expect, it, vi } from "vitest";

const mockListLessonCompletionTimestampsForUser = vi.fn();
vi.mock("@/server/lesson-progress/repo", () => ({
  listLessonCompletionTimestampsForUser: (userId: unknown, since: unknown) =>
    mockListLessonCompletionTimestampsForUser(userId, since),
}));

const mockGetTodaySessionSeconds = vi.fn();
vi.mock("@/server/session-time/service", () => ({
  getTodaySessionSeconds: (userId: unknown, at: unknown) => mockGetTodaySessionSeconds(userId, at),
}));

import { DAILY_GOAL_EVALUATORS } from "./evaluators";

const USER_ID = "user_1";
const AT = new Date("2026-09-24T10:00:00.000Z"); // 2026-09-24 15:30 IST

describe("study_minutes evaluator", () => {
  it("floors seconds down to whole minutes", async () => {
    mockGetTodaySessionSeconds.mockResolvedValueOnce(119); // 1m59s

    expect(await DAILY_GOAL_EVALUATORS.study_minutes(USER_ID, AT)).toBe(1);
  });

  it("returns 0 with no session time recorded yet", async () => {
    mockGetTodaySessionSeconds.mockResolvedValueOnce(0);

    expect(await DAILY_GOAL_EVALUATORS.study_minutes(USER_ID, AT)).toBe(0);
  });
});

describe("lesson_completed evaluator", () => {
  it("counts today's (IST) lesson completions, passing the IST day-start boundary", async () => {
    mockListLessonCompletionTimestampsForUser.mockResolvedValueOnce([new Date(), new Date()]);

    const result = await DAILY_GOAL_EVALUATORS.lesson_completed(USER_ID, AT);

    expect(result).toBe(2);
    expect(mockListLessonCompletionTimestampsForUser).toHaveBeenCalledWith(
      USER_ID,
      new Date("2026-09-23T18:30:00.000Z"), // IST midnight for 2026-09-24
    );
  });
});

describe("pulse_check evaluator", () => {
  it("returns 0 (no Phase 5 data source yet) without throwing", async () => {
    expect(await DAILY_GOAL_EVALUATORS.pulse_check(USER_ID, AT)).toBe(0);
  });
});
