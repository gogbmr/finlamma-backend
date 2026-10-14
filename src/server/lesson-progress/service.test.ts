import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// completeUngradedLesson's captureEvent call (docs/ARCHITECTURE.md D69)
// would otherwise pull in the real @/lib/analytics -> @/lib/env unmocked here.
vi.mock("@/lib/analytics", () => ({ captureEvent: vi.fn() }));

const mockGetPublishedLesson = vi.fn();
const mockListPublishedLessonsForWorld = vi.fn();
vi.mock("@/server/lessons/repo", () => ({
  getPublishedLesson: (id: unknown) => mockGetPublishedLesson(id),
  listPublishedLessonsForWorld: (worldId: unknown) => mockListPublishedLessonsForWorld(worldId),
}));

const mockGetLessonFlowScoringSettings = vi.fn();
vi.mock("@/server/settings/service", () => ({
  getLessonFlowScoringSettings: () => mockGetLessonFlowScoringSettings(),
}));

// D76 (docs/ARCHITECTURE.md): assertLessonUnlocked's dependencies - the
// real (unmocked) @/server/lessons/service is pulled in for
// serveUngradedLesson/completeUngradedLesson's new lock-check call, exactly
// the same "mock what it transitively needs" shape
// quiz-attempts/service.test.ts already established for the same function.
const mockListPublishedWorlds = vi.fn();
vi.mock("@/server/worlds/repo", () => ({
  listPublishedWorlds: () => mockListPublishedWorlds(),
}));

// Never actually called along this file's code paths - mocked purely so the
// real @/server/questions/repo (which imports @/db/client at module scope)
// is never evaluated, same reasoning as quiz-attempts/service.test.ts's
// identical stub.
vi.mock("@/server/questions/repo", () => ({
  getQuestionsByIds: () => Promise.resolve([]),
}));

const mockGetWorldIdsWithPassedBossQuiz = vi.fn();
vi.mock("@/server/quiz-attempts/repo", () => ({
  getWorldIdsWithPassedBossQuiz: (userId: unknown, passMarkPct: unknown) =>
    mockGetWorldIdsWithPassedBossQuiz(userId, passMarkPct),
}));

const mockStartLessonProgress = vi.fn();
const mockGetLessonProgress = vi.fn();
const mockCompleteUngradedLessonProgressIfEligible = vi.fn();
const mockGetLessonProgressStatusesForUser = vi.fn();
vi.mock("./repo", () => ({
  startLessonProgress: (userId: unknown, lessonId: unknown) => mockStartLessonProgress(userId, lessonId),
  getLessonProgress: (userId: unknown, lessonId: unknown) => mockGetLessonProgress(userId, lessonId),
  completeUngradedLessonProgressIfEligible: (userId: unknown, lessonId: unknown, minStartedAt: unknown) =>
    mockCompleteUngradedLessonProgressIfEligible(userId, lessonId, minStartedAt),
  getLessonProgressStatusesForUser: (userId: unknown, lessonIds: unknown) =>
    mockGetLessonProgressStatusesForUser(userId, lessonIds),
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
  return { id: LESSON_ID, worldId: "world_1", kind: "story", xpOverride: null, vmOverride: null, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLessonFlowScoringSettings.mockResolvedValue(SETTINGS);
  // Default: not credited - tests that need the badge-evaluation hook to
  // fire override this with { credited: true } for that specific call.
  mockCreditLessonCompletion.mockResolvedValue({ credited: false });
  // D76 (docs/ARCHITECTURE.md) assertLessonUnlocked defaults: a single
  // published world ("world_1", matching storyLesson()'s default worldId) at
  // index 0 - never locked - and a single-lesson world (LESSON_ID) with no
  // progress, which always computes to "current" - allowed. Tests that
  // specifically exercise LESSON_LOCKED override these.
  mockListPublishedWorlds.mockResolvedValue([{ id: "world_1" }]);
  mockGetWorldIdsWithPassedBossQuiz.mockResolvedValue(new Set());
  mockListPublishedLessonsForWorld.mockResolvedValue([{ id: LESSON_ID }]);
  mockGetLessonProgressStatusesForUser.mockResolvedValue(new Map());
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

  // D76 (docs/ARCHITECTURE.md): enforcement, via the exact same
  // computeLessonStatesForWorld GET /worlds/{id}/lessons uses
  // (src/server/lessons/service.ts) - covers the Doubt Zone scripted node
  // too (UNGRADED_KINDS includes "doubt_zone", same code path).
  it("rejects serving a lesson whose world isn't unlocked yet, before starting any row", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson({ worldId: "world_2" }));
    mockListPublishedWorlds.mockResolvedValueOnce([{ id: "world_1" }, { id: "world_2" }]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());

    await expect(serveUngradedLesson(USER, LESSON_ID, META)).rejects.toMatchObject({
      code: "LESSON_LOCKED",
    });
    expect(mockStartLessonProgress).not.toHaveBeenCalled();
  });

  it("rejects serving a locked Doubt Zone scripted node the same way as Story", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson({ kind: "doubt_zone", worldId: "world_2" }));
    mockListPublishedWorlds.mockResolvedValueOnce([{ id: "world_1" }, { id: "world_2" }]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());

    await expect(serveUngradedLesson(USER, LESSON_ID, META)).rejects.toMatchObject({
      code: "LESSON_LOCKED",
    });
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

  // D76 (docs/ARCHITECTURE.md)
  it("rejects completing a lesson whose world isn't unlocked yet, crediting nothing", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(storyLesson({ worldId: "world_2" }));
    mockListPublishedWorlds.mockResolvedValueOnce([{ id: "world_1" }, { id: "world_2" }]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());

    await expect(completeUngradedLesson(USER, LESSON_ID, META)).rejects.toMatchObject({
      code: "LESSON_LOCKED",
    });
    expect(mockGetLessonProgress).not.toHaveBeenCalled();
    expect(mockCreditLessonCompletion).not.toHaveBeenCalled();
  });
});
