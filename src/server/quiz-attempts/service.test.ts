import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPublishedLesson = vi.fn();
vi.mock("@/server/lessons/repo", () => ({
  getPublishedLesson: (id: unknown) => mockGetPublishedLesson(id),
}));

const mockGetQuestionById = vi.fn();
vi.mock("@/server/questions/repo", () => ({
  getQuestionById: (id: unknown) => mockGetQuestionById(id),
  getQuestionsByIds: () => Promise.resolve([]),
}));

// Never actually called (extractQuestionIds is a pure content parser), but
// @/server/lessons/service (imported for extractQuestionIds) also imports
// this at module scope - unmocked, it would pull in the real @/db/client
// and fail on missing env vars in this unit-test environment.
vi.mock("@/server/worlds/repo", () => ({
  getWorldById: () => Promise.resolve(null),
  listPublishedWorlds: () => Promise.resolve([]),
}));

const mockGetLessonFlowScoringSettings = vi.fn();
vi.mock("@/server/settings/service", () => ({
  getLessonFlowScoringSettings: () => mockGetLessonFlowScoringSettings(),
}));

const mockCompleteAttempt = vi.fn();
const mockCountAttemptsForUserLesson = vi.fn();
const mockGetAttemptById = vi.fn();
const mockGetLatestInProgressAttempt = vi.fn();
const mockGetPreviousQuestionAnswer = vi.fn();
const mockGetQuestionAnswer = vi.fn();
const mockGradeQuestionAnswer = vi.fn();
const mockInsertAttempt = vi.fn();
const mockInsertServedQuestionAnswer = vi.fn();
const mockListQuestionAnswersForAttempt = vi.fn();
vi.mock("./repo", () => ({
  completeAttempt: (id: unknown, xp: unknown) => mockCompleteAttempt(id, xp),
  countAttemptsForUserLesson: (userId: unknown, lessonId: unknown) =>
    mockCountAttemptsForUserLesson(userId, lessonId),
  getAttemptById: (id: unknown) => mockGetAttemptById(id),
  getLatestInProgressAttempt: (userId: unknown, lessonId: unknown) =>
    mockGetLatestInProgressAttempt(userId, lessonId),
  getPreviousQuestionAnswer: (attemptId: unknown, stepIndex: unknown) =>
    mockGetPreviousQuestionAnswer(attemptId, stepIndex),
  getQuestionAnswer: (attemptId: unknown, stepIndex: unknown) =>
    mockGetQuestionAnswer(attemptId, stepIndex),
  gradeQuestionAnswer: (input: unknown) => mockGradeQuestionAnswer(input),
  insertAttempt: (input: unknown) => mockInsertAttempt(input),
  insertServedQuestionAnswer: (input: unknown) => mockInsertServedQuestionAnswer(input),
  listQuestionAnswersForAttempt: (attemptId: unknown) => mockListQuestionAnswersForAttempt(attemptId),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import { serveStep, submitAnswer } from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const USER = { id: "user_1" };
const LESSON_ID = "lesson_1";
const ATTEMPT_ID = "attempt_1";
const Q1_ID = "11111111-1111-4111-8111-111111111111";
const Q2_ID = "22222222-2222-4222-8222-222222222222";

const SCORING_SETTINGS = {
  popQuiz: { correctXp: 20, wrongXp: 4 },
  practiceQuiz: { correctXp: 20, wrongXp: 5 },
  practiceQuizTimerSeconds: 15,
  speedBonusThresholdPct: 45,
  speedBonusXp: 10,
  comboBonusPerStep: 3,
  comboBonusCap: 5,
  feverComboThreshold: 3,
  feverMultiplier: 2,
};

function quizLesson(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LESSON_ID,
    kind: "quiz",
    content: { questionIds: [Q1_ID, Q2_ID] },
    ...overrides,
  };
}

function questionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: Q1_ID,
    format: "single_select" as const,
    prompt: { en: "What is a stock?", hi: "x", hx: "x" },
    explanation: { en: "A share of a company.", hi: "x", hx: "x" },
    payload: { options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }] },
    answer: { correctIndex: 0 },
    status: "published" as const,
    revision: 1,
    ...overrides,
  };
}

function attemptRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ATTEMPT_ID,
    userId: USER.id,
    lessonId: LESSON_ID,
    attemptNumber: 1,
    isFirstPass: true,
    status: "in_progress" as const,
    totalXpPreview: null,
    ...overrides,
  };
}

function servedAnswerRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "qa_1",
    attemptId: ATTEMPT_ID,
    questionId: Q1_ID,
    stepIndex: 1,
    servedAt: new Date("2026-01-01T00:00:00.000Z"),
    timerSeconds: 10,
    answeredAt: null,
    submittedAnswer: null,
    isCorrect: null,
    timedOut: null,
    speedBonusAwarded: null,
    feverActive: null,
    xpAwardedPreview: null,
    comboAfter: null,
    questionRevision: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLessonFlowScoringSettings.mockResolvedValue(SCORING_SETTINGS);
  // Matches servedAnswerRow()'s default servedAt, so any test that doesn't
  // care about elapsed time gets elapsed=0 by default - tests that DO care
  // move the clock forward explicitly with vi.setSystemTime().
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("serveStep", () => {
  it("throws NOT_FOUND for an unknown/unpublished lesson", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(null);

    await expect(serveStep(USER, LESSON_ID, 1, META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws VALIDATION_FAILED for a lesson with no graded steps (story/doubt_zone)", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(
      quizLesson({ kind: "story", content: { lengthSeconds: 60, pages: [{ text: { en: "x", hi: "x", hx: "x" } }] } }),
    );

    await expect(serveStep(USER, LESSON_ID, 1, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("throws VALIDATION_FAILED for a stepIndex out of range", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());

    await expect(serveStep(USER, LESSON_ID, 3, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    await expect(serveStep(USER, LESSON_ID, 0, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("throws CONFLICT when no attempt exists and stepIndex isn't 1 (no skip-ahead into a fresh attempt)", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(null);

    await expect(serveStep(USER, LESSON_ID, 2, META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockInsertAttempt).not.toHaveBeenCalled();
  });

  it("starts a new attempt on step 1, computing attemptNumber/isFirstPass, and logs it", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(null);
    mockCountAttemptsForUserLesson.mockResolvedValueOnce(2); // this is the 3rd attempt
    const newAttempt = attemptRow({ attemptNumber: 3, isFirstPass: false });
    mockInsertAttempt.mockResolvedValueOnce(newAttempt);
    mockGetQuestionAnswer.mockResolvedValueOnce(null);
    mockGetQuestionById.mockResolvedValue(questionRow());
    mockInsertServedQuestionAnswer.mockResolvedValueOnce(servedAnswerRow());

    const result = await serveStep(USER, LESSON_ID, 1, META);

    expect(mockInsertAttempt).toHaveBeenCalledWith({
      userId: USER.id,
      lessonId: LESSON_ID,
      attemptNumber: 3,
      isFirstPass: false,
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "quiz_attempt.started", actorType: "user" }),
    );
    expect(result.attemptId).toBe(ATTEMPT_ID);
    expect(result.totalSteps).toBe(2);
  });

  it("no-skip-ahead: rejects serving a step whose predecessor isn't answered yet", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(null); // step 2 not yet served
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ answeredAt: null })); // step 1 unanswered

    await expect(serveStep(USER, LESSON_ID, 2, META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockInsertServedQuestionAnswer).not.toHaveBeenCalled();
  });

  it("serves step 2 once step 1 is answered", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(null);
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(
      servedAnswerRow({ stepIndex: 1, answeredAt: new Date() }),
    );
    mockGetQuestionById.mockResolvedValue(questionRow({ id: Q2_ID }));
    mockInsertServedQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, questionId: Q2_ID }));

    const result = await serveStep(USER, LESSON_ID, 2, META);

    expect(result.stepIndex).toBe(2);
  });

  it("idempotent resume: re-serving the current unanswered step returns the same servedAt without creating a new row", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    const existing = servedAnswerRow();
    mockGetQuestionAnswer.mockResolvedValueOnce(existing);
    mockGetQuestionById.mockResolvedValue(questionRow());

    const result = await serveStep(USER, LESSON_ID, 1, META);

    expect(result.servedAt).toBe(existing.servedAt.toISOString());
    expect(mockInsertServedQuestionAnswer).not.toHaveBeenCalled();
  });

  it("rejects re-serving an already-answered step", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ answeredAt: new Date() }));

    await expect(serveStep(USER, LESSON_ID, 1, META)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("never includes an 'answer' or 'explanation' key anywhere in the response", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow());
    mockGetQuestionById.mockResolvedValue(questionRow());

    const result = await serveStep(USER, LESSON_ID, 1, META);

    expect(JSON.stringify(result)).not.toMatch(/"answer"/i);
    expect(JSON.stringify(result)).not.toMatch(/"explanation"/i);
  });

  it("uses the video cue's own timerSeconds for a pop-quiz step, not the practice-quiz default", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(
      quizLesson({
        kind: "video",
        content: {
          lengthSeconds: 48,
          scenes: [],
          cues: [{ at: 5, questionId: Q1_ID, timerSeconds: 8 }],
        },
      }),
    );
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(null);
    mockCountAttemptsForUserLesson.mockResolvedValueOnce(0);
    mockInsertAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(null);
    mockGetQuestionById.mockResolvedValue(questionRow());
    mockInsertServedQuestionAnswer.mockImplementation((input) =>
      Promise.resolve(servedAnswerRow({ timerSeconds: input.timerSeconds })),
    );

    const result = await serveStep(USER, LESSON_ID, 1, META);

    expect(result.timerSeconds).toBe(8); // the cue's own timer, not practiceQuizTimerSeconds (15)
  });
});

describe("submitAnswer", () => {
  it("throws CONFLICT when there's no active attempt", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(null);

    await expect(
      submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws CONFLICT when the step hasn't been served yet", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(null);

    await expect(
      submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws VALIDATION_FAILED for an answer that doesn't match the question's format shape", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow());
    mockGetQuestionById.mockResolvedValueOnce(questionRow());

    await expect(
      submitAnswer(USER, LESSON_ID, 1, { notAField: true }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockGradeQuestionAnswer).not.toHaveBeenCalled();
  });

  // The core idempotency rule: one answer per question per attempt.
  // Double-tap = same result, no double scoring.
  it("idempotent: a step that's already answered returns the exact stored result, without re-grading", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(
      servedAnswerRow({
        answeredAt: new Date(),
        isCorrect: true,
        timedOut: false,
        speedBonusAwarded: true,
        feverActive: false,
        xpAwardedPreview: 33,
        comboAfter: 1,
      }),
    );
    mockGetQuestionById.mockResolvedValueOnce(questionRow());

    // Even a wildly different (and structurally invalid) "answer" on the
    // resubmit must not matter - the stored result wins unconditionally.
    const result = await submitAnswer(USER, LESSON_ID, 1, { garbage: true }, META);

    expect(result.xpAwardedPreview).toBe(33);
    expect(result.isCorrect).toBe(true);
    expect(mockGradeQuestionAnswer).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("grades correctly, is server-timed (elapsed computed from stored servedAt, not any client value), and reveals the answer/explanation only for this question", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z")); // 5s after servedAnswerRow's servedAt
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ timerSeconds: 10 })); // 10s budget, 5s elapsed
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null); // step 1, no prior combo
    mockGradeQuestionAnswer.mockImplementationOnce((input) =>
      Promise.resolve(servedAnswerRow({ ...input, answeredAt: input.answeredAt })),
    );

    const result = await submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META);

    expect(result.isCorrect).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.correctAnswer).toEqual({ correctIndex: 0 });
    expect(result.explanation).toEqual(questionRow().explanation);
    expect(mockGradeQuestionAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: true, timedOut: false }),
    );
  });

  it("a timeout grades as wrong even though the submitted answer was correct", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:25.000Z")); // 25s after servedAt
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ timerSeconds: 10 })); // way over budget
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
    mockGradeQuestionAnswer.mockImplementationOnce((input) => Promise.resolve(servedAnswerRow(input)));

    const result = await submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META);

    expect(result.timedOut).toBe(true);
    expect(result.isCorrect).toBe(false);
    // quizLesson()'s default kind is "quiz" -> practiceQuiz.wrongXp (5), not popQuiz's.
    expect(mockGradeQuestionAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ isCorrect: false, timedOut: true, xpAwardedPreview: 5 }),
    );
  });

  it("threads comboBefore from the previous step's stored comboAfter when it was correct", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(
      servedAnswerRow({ stepIndex: 1, isCorrect: true, comboAfter: 2 }),
    );
    mockGradeQuestionAnswer.mockImplementationOnce((input) => Promise.resolve(servedAnswerRow(input)));
    // stepIndex 2 is quizLesson()'s last step - completion path runs too.
    mockListQuestionAnswersForAttempt.mockResolvedValueOnce([servedAnswerRow({ xpAwardedPreview: 10 })]);
    mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", totalXpPreview: 10 }));

    await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

    expect(mockGradeQuestionAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ comboAfter: 3 }), // comboBefore(2) + 1
    );
  });

  it("resets comboBefore to 0 when the previous step was wrong", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(
      servedAnswerRow({ stepIndex: 1, isCorrect: false, comboAfter: 0 }),
    );
    mockGradeQuestionAnswer.mockImplementationOnce((input) => Promise.resolve(servedAnswerRow(input)));
    mockListQuestionAnswersForAttempt.mockResolvedValueOnce([servedAnswerRow({ xpAwardedPreview: 10 })]);
    mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", totalXpPreview: 10 }));

    await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

    expect(mockGradeQuestionAnswer).toHaveBeenCalledWith(expect.objectContaining({ comboAfter: 1 }));
  });

  it("uses admin-editable scoring settings (settings_kv) for XP, not hardcoded constants", async () => {
    // quizLesson()'s default kind is "quiz" -> practiceQuiz's constants apply.
    mockGetLessonFlowScoringSettings.mockResolvedValue({
      ...SCORING_SETTINGS,
      practiceQuiz: { correctXp: 999, wrongXp: 1 },
    });
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ timerSeconds: 10 }));
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
    mockGradeQuestionAnswer.mockImplementationOnce((input) => Promise.resolve(servedAnswerRow(input)));

    await submitAnswer(USER, LESSON_ID, 1, { correctIndex: 999 }, META); // wrong on purpose

    expect(mockGradeQuestionAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ xpAwardedPreview: 1 }), // the custom wrongXp, not the default 5
    );
  });

  it("completes the attempt and sums totalXpPreview once the last step is answered, logging completion", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson()); // 2 total steps
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
    mockGradeQuestionAnswer.mockImplementationOnce((input) =>
      Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
    );
    mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
      servedAnswerRow({ stepIndex: 1, xpAwardedPreview: 20 }),
      servedAnswerRow({ stepIndex: 2, xpAwardedPreview: 33 }),
    ]);
    mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", totalXpPreview: 53 }));

    const result = await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

    expect(mockCompleteAttempt).toHaveBeenCalledWith(ATTEMPT_ID, 53);
    expect(result.isAttemptComplete).toBe(true);
    expect(result.totalXpPreview).toBe(53);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "quiz_attempt.completed" }),
    );
  });

  it("does not complete the attempt when the answered step isn't the last one", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 1, timerSeconds: 10 }));
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
    mockGradeQuestionAnswer.mockImplementationOnce((input) => Promise.resolve(servedAnswerRow(input)));

    const result = await submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META);

    expect(mockCompleteAttempt).not.toHaveBeenCalled();
    expect(result.isAttemptComplete).toBe(false);
    expect(result.totalXpPreview).toBeNull();
  });

  it("falls back to the concurrent winner's stored row when gradeQuestionAnswer loses a race", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer
      .mockResolvedValueOnce(servedAnswerRow({ timerSeconds: 10 })) // initial lookup: unanswered
      .mockResolvedValueOnce(
        servedAnswerRow({ answeredAt: new Date(), isCorrect: true, xpAwardedPreview: 30 }),
      ); // re-fetch after losing the race
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
    mockGradeQuestionAnswer.mockResolvedValueOnce(null); // lost the race

    const result = await submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META);

    expect(result.xpAwardedPreview).toBe(30);
  });
});
