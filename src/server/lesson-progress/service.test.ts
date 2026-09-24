import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPublishedLesson = vi.fn();
vi.mock("@/server/lessons/repo", () => ({
  getPublishedLesson: (id: unknown) => mockGetPublishedLesson(id),
}));

const mockGetLessonFlowScoringSettings = vi.fn();
vi.mock("@/server/settings/service", () => ({
  getLessonFlowScoringSettings: () => mockGetLessonFlowScoringSettings(),
}));

const mockStartLessonProgress = vi.fn();
const mockGetLessonProgress = vi.fn();
const mockCompleteUngradedLessonProgressIfEligible = vi.fn();
vi.mock("./repo", () => ({
  startLessonProgress: (userId: unknown, lessonId: unknown) => mockStartLessonProgress(userId, lessonId),
  getLessonProgress: (userId: unknown, lessonId: unknown) => mockGetLessonProgress(userId, lessonId),
  completeUngradedLessonProgressIfEligible: (userId: unknown, lessonId: unknown, minStartedAt: unknown) =>
    mockCompleteUngradedLessonProgressIfEligible(userId, lessonId, minStartedAt),
}));

const mockCreditLessonCompletion = vi.fn();
vi.mock("@/server/economy/service", () => ({
  creditLessonCompletion: (...args: unknown[]) => mockCreditLessonCompletion(...args),
}));

const mockEvaluateBadgesForUser = vi.fn();
vi.mock("@/server/badges/service", () => ({
  evaluateBadgesForUser: (user: unknown, meta: unknown) => mockEvaluateBadgesForUser(user, meta),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import { completeUngradedLesson, serveUngradedLesson } from "./service";

const USER = { id: "user_1" };
const LESSON_ID = "lesson_1";
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

const SETTINGS = {
  storyMinCompletionSeconds: 180,
  doubtZoneMinCompletionSeconds: 150,
};

function storyLesson(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: LESSON_ID, kind: "story", xpOverride: null, vmOverride: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLessonFlowScoringSettings.mockResolvedValue(SETTINGS);
  // Default: not credited - tests that need the badge-evaluation hook to
  // fire override this with { credited: true } for that specific call.
  mockCreditLessonCompletion.mockResolvedValue({ credited: false });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:10:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("serveUngradedLesson", () => {
  it("rejects a graded lesson kind (e.g. quiz) - use the graded-step endpoints instead", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson({ kind: "quiz" }));

    await expect(serveUngradedLesson(USER, LESSON_ID, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockStartLessonProgress).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unpublished/unknown lesson", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(null);

    await expect(serveUngradedLesson(USER, LESSON_ID, META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("starts a new row and logs the serve", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    const startedAt = new Date("2026-01-01T00:10:00.000Z");
    mockStartLessonProgress.mockResolvedValueOnce({ status: "in_progress", startedAt });

    const result = await serveUngradedLesson(USER, LESSON_ID, META);

    expect(result).toEqual({ lessonId: LESSON_ID, status: "in_progress", startedAt: startedAt.toISOString() });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lesson_progress.served" }),
    );
  });

  it("re-serving an already-served lesson returns the ORIGINAL startedAt, without re-logging", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    mockStartLessonProgress.mockResolvedValueOnce(null); // onConflictDoNothing - already exists
    const originalStartedAt = new Date("2025-12-31T23:00:00.000Z");
    mockGetLessonProgress.mockResolvedValueOnce({ status: "in_progress", startedAt: originalStartedAt });

    const result = await serveUngradedLesson(USER, LESSON_ID, META);

    expect(result.startedAt).toBe(originalStartedAt.toISOString());
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("completeUngradedLesson", () => {
  it("throws CONFLICT when the lesson was never served", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    mockGetLessonProgress.mockResolvedValueOnce(null);

    await expect(completeUngradedLesson(USER, LESSON_ID, META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockCompleteUngradedLessonProgressIfEligible).not.toHaveBeenCalled();
  });

  it("throws LESSON_TOO_SOON when the minimum time hasn't elapsed (instant-complete rejected)", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    const startedAt = new Date("2026-01-01T00:09:50.000Z"); // 10s ago, well under 180s
    mockGetLessonProgress
      .mockResolvedValueOnce({ status: "in_progress", startedAt }) // initial read
      .mockResolvedValueOnce({ status: "in_progress", startedAt }); // re-read after ineligible update
    mockCompleteUngradedLessonProgressIfEligible.mockResolvedValueOnce(null);

    await expect(completeUngradedLesson(USER, LESSON_ID, META)).rejects.toMatchObject({
      code: "LESSON_TOO_SOON",
      details: { minSeconds: 180, secondsElapsed: 10 },
    });
    expect(mockCreditLessonCompletion).not.toHaveBeenCalled();
  });

  it("completes and credits once the minimum time has elapsed", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    const startedAt = new Date("2026-01-01T00:05:00.000Z"); // 5 min ago, past the 180s story minimum
    mockGetLessonProgress.mockResolvedValueOnce({ status: "in_progress", startedAt });
    const completedAt = new Date("2026-01-01T00:10:00.000Z");
    mockCompleteUngradedLessonProgressIfEligible.mockResolvedValueOnce({
      status: "completed",
      completedAt,
    });

    const result = await completeUngradedLesson(USER, LESSON_ID, META);

    expect(result).toEqual({
      lessonId: LESSON_ID,
      status: "completed",
      completedAt: completedAt.toISOString(),
      credited: true,
    });
    expect(mockCreditLessonCompletion).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ id: LESSON_ID, kind: "story" }),
      true,
      META,
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lesson_progress.completed" }),
    );
  });

  it("uses doubtZoneMinCompletionSeconds for a doubt_zone lesson, not the story minimum", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson({ kind: "doubt_zone" }));
    const startedAt = new Date("2026-01-01T00:09:50.000Z"); // 10s ago
    mockGetLessonProgress
      .mockResolvedValueOnce({ status: "in_progress", startedAt })
      .mockResolvedValueOnce({ status: "in_progress", startedAt });
    mockCompleteUngradedLessonProgressIfEligible.mockResolvedValueOnce(null);

    await expect(completeUngradedLesson(USER, LESSON_ID, META)).rejects.toMatchObject({
      details: { minSeconds: 150, secondsElapsed: 10 },
    });
  });

  it("a completed lesson replay returns credited: false without calling creditLessonCompletion again", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    const completedAt = new Date("2026-01-01T00:05:00.000Z");
    mockGetLessonProgress.mockResolvedValueOnce({ status: "completed", completedAt });

    const result = await completeUngradedLesson(USER, LESSON_ID, META);

    expect(result).toEqual({
      lessonId: LESSON_ID,
      status: "completed",
      completedAt: completedAt.toISOString(),
      credited: false,
    });
    expect(mockCompleteUngradedLessonProgressIfEligible).not.toHaveBeenCalled();
    expect(mockCreditLessonCompletion).not.toHaveBeenCalled();
  });

  it("a concurrent duplicate completion (raced) is treated as an idempotent replay, not LESSON_TOO_SOON", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    const startedAt = new Date("2026-01-01T00:05:00.000Z");
    const completedAt = new Date("2026-01-01T00:09:59.000Z");
    mockGetLessonProgress
      .mockResolvedValueOnce({ status: "in_progress", startedAt }) // initial read
      .mockResolvedValueOnce({ status: "completed", completedAt }); // re-read: a concurrent request won
    mockCompleteUngradedLessonProgressIfEligible.mockResolvedValueOnce(null); // this call's WHERE didn't match

    const result = await completeUngradedLesson(USER, LESSON_ID, META);

    expect(result).toEqual({
      lessonId: LESSON_ID,
      status: "completed",
      completedAt: completedAt.toISOString(),
      credited: false,
    });
    expect(mockCreditLessonCompletion).not.toHaveBeenCalled();
  });

  it("passes the lesson's xpOverride/vmOverride through to creditLessonCompletion", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson({ xpOverride: 999, vmOverride: 500 }));
    const startedAt = new Date("2026-01-01T00:05:00.000Z");
    mockGetLessonProgress.mockResolvedValueOnce({ status: "in_progress", startedAt });
    mockCompleteUngradedLessonProgressIfEligible.mockResolvedValueOnce({
      status: "completed",
      completedAt: new Date(),
    });

    await completeUngradedLesson(USER, LESSON_ID, META);

    expect(mockCreditLessonCompletion).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ xpOverride: 999, vmOverride: 500 }),
      true,
      META,
    );
  });

  it("evaluates badges after a real credit", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    const startedAt = new Date("2026-01-01T00:05:00.000Z");
    mockGetLessonProgress.mockResolvedValueOnce({ status: "in_progress", startedAt });
    mockCompleteUngradedLessonProgressIfEligible.mockResolvedValueOnce({
      status: "completed",
      completedAt: new Date(),
    });
    mockCreditLessonCompletion.mockResolvedValueOnce({ credited: true });

    await completeUngradedLesson(USER, LESSON_ID, META);

    expect(mockEvaluateBadgesForUser).toHaveBeenCalledWith(USER, META);
  });

  it("never evaluates badges on an idempotent replay (nothing credited)", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    const completedAt = new Date("2026-01-01T00:09:59.000Z");
    mockGetLessonProgress.mockResolvedValueOnce({ status: "completed", completedAt });

    await completeUngradedLesson(USER, LESSON_ID, META);

    expect(mockEvaluateBadgesForUser).not.toHaveBeenCalled();
  });

  it("a badge-evaluation failure never breaks the lesson-completion response", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson());
    const startedAt = new Date("2026-01-01T00:05:00.000Z");
    mockGetLessonProgress.mockResolvedValueOnce({ status: "in_progress", startedAt });
    mockCompleteUngradedLessonProgressIfEligible.mockResolvedValueOnce({
      status: "completed",
      completedAt: new Date(),
    });
    mockCreditLessonCompletion.mockResolvedValueOnce({ credited: true });
    mockEvaluateBadgesForUser.mockRejectedValueOnce(new Error("boom"));

    const result = await completeUngradedLesson(USER, LESSON_ID, META);

    expect(result.credited).toBe(true);
  });
});
