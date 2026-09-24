import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPublishedLesson = vi.fn();
vi.mock("@/server/lessons/repo", () => ({
  getPublishedLesson: (id: unknown) => mockGetPublishedLesson(id),
}));

const mockGetQuestionById = vi.fn();
const mockGetQuestionRevision = vi.fn();
vi.mock("@/server/questions/repo", () => ({
  getQuestionById: (id: unknown) => mockGetQuestionById(id),
  getQuestionRevision: (questionId: unknown, revision: unknown) =>
    mockGetQuestionRevision(questionId, revision),
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

const mockStartLessonProgress = vi.fn();
const mockCompleteLessonProgress = vi.fn();
vi.mock("@/server/lesson-progress/repo", () => ({
  startLessonProgress: (userId: unknown, lessonId: unknown) =>
    mockStartLessonProgress(userId, lessonId),
  completeLessonProgress: (userId: unknown, lessonId: unknown) =>
    mockCompleteLessonProgress(userId, lessonId),
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
  completeAttempt: (id: unknown, xp: unknown, accuracyPct: unknown) =>
    mockCompleteAttempt(id, xp, accuracyPct),
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

const mockCreditLessonCompletion = vi.fn();
vi.mock("@/server/economy/service", () => ({
  creditLessonCompletion: (
    user: unknown,
    lesson: unknown,
    successful: unknown,
    meta: unknown,
  ) => mockCreditLessonCompletion(user, lesson, successful, meta),
}));

const mockIssueCertificateIfEligible = vi.fn();
vi.mock("@/server/certificates/service", () => ({
  issueCertificateIfEligible: (
    user: unknown,
    worldId: unknown,
    accuracyPct: unknown,
    meta: unknown,
  ) => mockIssueCertificateIfEligible(user, worldId, accuracyPct, meta),
}));

const mockEvaluateBadgesForUser = vi.fn();
vi.mock("@/server/badges/service", () => ({
  evaluateBadgesForUser: (user: unknown, meta: unknown) => mockEvaluateBadgesForUser(user, meta),
}));

const mockLogInternalError = vi.fn();
vi.mock("@/lib/http", () => ({
  logInternalError: (errorId: unknown, err: unknown) => mockLogInternalError(errorId, err),
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
  bossQuizPassMarkPct: 60,
  lessonPassMarkPct: 50,
};

function quizLesson(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LESSON_ID,
    kind: "quiz",
    content: { questionIds: [Q1_ID, Q2_ID] },
    ...overrides,
  };
}

// extractQuestionIds (src/server/lessons/service.ts) reads a DIFFERENT
// content shape for "video" (VideoContentSchema's `cues[].questionId`) than
// for quiz/boss_quiz/role_play (QuizLikeContentSchema's flat `questionIds`)
// - quizLesson()'s own default only matches the latter. Tests that need a
// real 2-question lesson across multiple kinds (e.g. it.each) must use this
// so a "video" case doesn't fail assertGradedLesson's "no graded steps"
// check with the wrong shape.
function contentForKind(kind: string) {
  return kind === "video"
    ? {
        lengthSeconds: 48,
        scenes: [],
        cues: [
          { at: 5, questionId: Q1_ID, timerSeconds: 8 },
          { at: 15, questionId: Q2_ID, timerSeconds: 8 },
        ],
      }
    : { questionIds: [Q1_ID, Q2_ID] };
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
    servedRevision: 1,
    answeredAt: null,
    submittedAnswer: null,
    isCorrect: null,
    timedOut: null,
    speedBonusAwarded: null,
    feverActive: null,
    xpAwardedPreview: null,
    comboAfter: null,
    ...overrides,
  };
}

// D22 (docs/ARCHITECTURE.md): the question_revisions snapshot at one
// specific revision - what grading actually reads, never the live
// `questions` row. Defaults to matching questionRow()'s content at
// revision 1.
function questionRevisionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "qrev_1",
    questionId: Q1_ID,
    revision: 1,
    prompt: questionRow().prompt,
    explanation: questionRow().explanation,
    payload: questionRow().payload,
    answer: questionRow().answer,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLessonFlowScoringSettings.mockResolvedValue(SCORING_SETTINGS);
  // Default: not credited - tests that need the post-credit hooks
  // (certificate issuance, badge evaluation) to fire override this with
  // { credited: true } for that specific call.
  mockCreditLessonCompletion.mockResolvedValue({ credited: false });
  // Default: the servedRevision requested always resolves to the matching
  // snapshot - tests that specifically exercise a hotfix-between-serve-and-
  // answer scenario override this per-call.
  mockGetQuestionRevision.mockResolvedValue(questionRevisionRow());
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

  // D23 (docs/ARCHITECTURE.md): feeds the world-unlock check
  // (worlds/service.ts) and the admin unpublish-warning (lessons/service.ts).
  it("starts lesson_progress for this lesson when a new attempt begins", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(null);
    mockCountAttemptsForUserLesson.mockResolvedValueOnce(0);
    mockInsertAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(null);
    mockGetQuestionById.mockResolvedValue(questionRow());
    mockInsertServedQuestionAnswer.mockResolvedValueOnce(servedAnswerRow());

    await serveStep(USER, LESSON_ID, 1, META);

    expect(mockStartLessonProgress).toHaveBeenCalledWith(USER.id, LESSON_ID);
  });

  it("does not re-start lesson_progress when resuming an already-in-progress attempt", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow());
    mockGetQuestionById.mockResolvedValue(questionRow());

    await serveStep(USER, LESSON_ID, 1, META);

    expect(mockStartLessonProgress).not.toHaveBeenCalled();
  });

  // D22 (docs/ARCHITECTURE.md): the revision grading will later use is
  // captured HERE, at serve time, from the live question's CURRENT
  // revision - not re-derived later at answer time.
  it("captures the question's current revision as servedRevision when a new step is served", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(null);
    mockGetQuestionById.mockResolvedValue(questionRow({ revision: 4 }));
    mockInsertServedQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ servedRevision: 4 }));

    await serveStep(USER, LESSON_ID, 1, META);

    expect(mockInsertServedQuestionAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ servedRevision: 4 }),
    );
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

  // Cross-question leak: serving step 1 of a 2-question lesson must only
  // ever touch step 1's own question, never step 2's - a structural
  // guarantee (only one questionId is ever looked up), proven directly
  // rather than trusted from the code shape alone.
  it("only fetches THIS step's question when serving - never another step's, in a multi-question lesson", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson()); // questionIds: [Q1_ID, Q2_ID]
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ questionId: Q1_ID }));
    mockGetQuestionById.mockResolvedValue(questionRow({ id: Q1_ID }));

    await serveStep(USER, LESSON_ID, 1, META);

    expect(mockGetQuestionById).toHaveBeenCalledWith(Q1_ID);
    expect(mockGetQuestionById).not.toHaveBeenCalledWith(Q2_ID);
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

  // D21 (docs/ARCHITECTURE.md): an answer arriving after the timer (plus the
  // documented 300ms latency allowance) is ACCEPTED, not rejected with an
  // error - submitAnswer resolves normally here, it never throws - but is
  // graded as timed out: wrong regardless of content, no speed bonus, combo
  // reset to 0.
  it("accepts (does not reject) an answer that arrives after the timer + latency allowance, but grades it as timed out", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:25.000Z")); // 25s after servedAt, way past a 10s timer + 300ms allowance
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ timerSeconds: 10 })); // way over budget
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
    mockGradeQuestionAnswer.mockImplementationOnce((input) => Promise.resolve(servedAnswerRow(input)));

    // The correct answer, submitted late - resolves successfully (not
    // rejected/thrown), just graded as wrong.
    const result = await submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META);

    expect(result.timedOut).toBe(true);
    expect(result.isCorrect).toBe(false);
    expect(result.speedBonusAwarded).toBe(false);
    expect(result.comboAfter).toBe(0);
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
      servedAnswerRow({ stepIndex: 1, xpAwardedPreview: 20, isCorrect: true }),
      servedAnswerRow({ stepIndex: 2, xpAwardedPreview: 33, isCorrect: false }),
    ]);
    mockCompleteAttempt.mockResolvedValueOnce(
      attemptRow({ status: "completed", totalXpPreview: 53, accuracyPct: 50 }),
    );

    const result = await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

    // D24 (docs/ARCHITECTURE.md): 1 correct of 2 steps = 50% accuracy,
    // computed from the graded question_answers rows, not trusted from
    // anywhere else.
    expect(mockCompleteAttempt).toHaveBeenCalledWith(ATTEMPT_ID, 53, 50);
    expect(result.isAttemptComplete).toBe(true);
    expect(result.totalXpPreview).toBe(53);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "quiz_attempt.completed" }),
    );
    // D23 (docs/ARCHITECTURE.md): feeds the world-unlock check.
    expect(mockCompleteLessonProgress).toHaveBeenCalledWith(USER.id, LESSON_ID);
  });

  it("computes 100% accuracy when every step was correct", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
    mockGradeQuestionAnswer.mockImplementationOnce((input) =>
      Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
    );
    mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
      servedAnswerRow({ stepIndex: 1, isCorrect: true }),
      servedAnswerRow({ stepIndex: 2, isCorrect: true }),
    ]);
    mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 100 }));

    await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

    expect(mockCompleteAttempt).toHaveBeenCalledWith(ATTEMPT_ID, expect.any(Number), 100);
  });

  it("computes 0% accuracy when every step was wrong", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
    mockGradeQuestionAnswer.mockImplementationOnce((input) =>
      Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
    );
    mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
      servedAnswerRow({ stepIndex: 1, isCorrect: false }),
      servedAnswerRow({ stepIndex: 2, isCorrect: false }),
    ]);
    mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 0 }));

    await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

    expect(mockCompleteAttempt).toHaveBeenCalledWith(ATTEMPT_ID, expect.any(Number), 0);
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
    expect(mockCompleteLessonProgress).not.toHaveBeenCalled();
    expect(mockCreditLessonCompletion).not.toHaveBeenCalled();
  });

  describe("XP/VM crediting (docs/ECONOMY.md decision 4, docs/ARCHITECTURE.md D26/D28)", () => {
    it.each(["video", "quiz", "role_play"] as const)(
      "does NOT credit a %s below the default 50% lessonPassMarkPct - not successful",
      async (kind) => {
        mockGetPublishedLesson.mockResolvedValueOnce(quizLesson({ kind, content: contentForKind(kind) }));
        mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
        mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
        mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
        mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
        mockGradeQuestionAnswer.mockImplementationOnce((input) =>
          Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
        );
        // 0/2 correct = 0% - below the default 50% lessonPassMarkPct.
        mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
          servedAnswerRow({ stepIndex: 1, isCorrect: false }),
          servedAnswerRow({ stepIndex: 2, isCorrect: false }),
        ]);
        mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 0 }));

        await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

        // completeLessonProgress still runs (D23: "completed" tracks
        // finishing, not passing) - only the credit call gets successful:false.
        expect(mockCompleteLessonProgress).toHaveBeenCalledWith(USER.id, LESSON_ID);
        expect(mockCreditLessonCompletion).toHaveBeenCalledWith(
          USER,
          expect.objectContaining({ id: LESSON_ID, kind }),
          false,
          META,
        );
      },
    );

    it.each(["video", "quiz", "role_play"] as const)(
      "credits a %s once accuracyPct clears the default 50% lessonPassMarkPct",
      async (kind) => {
        mockGetPublishedLesson.mockResolvedValueOnce(quizLesson({ kind, content: contentForKind(kind) }));
        mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
        mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
        mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
        mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
        mockGradeQuestionAnswer.mockImplementationOnce((input) =>
          Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
        );
        // 1/2 correct = 50% - clears the default 50% lessonPassMarkPct (>=).
        mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
          servedAnswerRow({ stepIndex: 1, isCorrect: true }),
          servedAnswerRow({ stepIndex: 2, isCorrect: false }),
        ]);
        mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 50 }));

        await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

        expect(mockCreditLessonCompletion).toHaveBeenCalledWith(
          USER,
          expect.objectContaining({ id: LESSON_ID, kind }),
          true,
          META,
        );
      },
    );

    it("a failed first attempt doesn't forfeit the reward - a later passing retry still credits once", async () => {
      // Attempt 1: fails (0%) - no credit, but no error either; the learner
      // can simply start a fresh attempt (serveStep's existing "no attempt
      // in progress -> start a new one" path, no code change needed here).
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson({ kind: "quiz" }));
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow({ attemptNumber: 1 }));
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: false }),
        servedAnswerRow({ stepIndex: 2, isCorrect: false }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(
        attemptRow({ attemptNumber: 1, status: "completed", accuracyPct: 0 }),
      );

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(mockCreditLessonCompletion).toHaveBeenLastCalledWith(
        USER,
        expect.objectContaining({ id: LESSON_ID }),
        false,
        META,
      );

      // Attempt 2: a fresh attempt (attemptNumber 2), same lesson - passes.
      // creditLessonCompletion's own (user, lesson) idempotency key (D26) is
      // what makes this the one that actually credits.
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson({ kind: "quiz" }));
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow({ attemptNumber: 2 }));
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: true }),
        servedAnswerRow({ stepIndex: 2, isCorrect: true }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(
        attemptRow({ attemptNumber: 2, status: "completed", accuracyPct: 100 }),
      );

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(mockCreditLessonCompletion).toHaveBeenLastCalledWith(
        USER,
        expect.objectContaining({ id: LESSON_ID }),
        true,
        META,
      );
      expect(mockCreditLessonCompletion).toHaveBeenCalledTimes(2);
    });

    it("credits a Boss Quiz as successful once accuracyPct clears the pass mark", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson({ kind: "boss_quiz" }));
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      // 100% - clears the default 60% bossQuizPassMarkPct.
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: true }),
        servedAnswerRow({ stepIndex: 2, isCorrect: true }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 100 }));

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(mockCreditLessonCompletion).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({ id: LESSON_ID, kind: "boss_quiz" }),
        true,
        META,
      );
    });

    it("issues a certificate for the world once a Boss Quiz passes (WH-16/PR-36)", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(
        quizLesson({ kind: "boss_quiz", worldId: "world_1" }),
      );
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: true }),
        servedAnswerRow({ stepIndex: 2, isCorrect: true }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 100 }));
      mockIssueCertificateIfEligible.mockResolvedValueOnce({ id: "cert_1" });

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(mockIssueCertificateIfEligible).toHaveBeenCalledWith(USER, "world_1", 100, META);
    });

    it("never issues a certificate for a Boss Quiz that failed to pass", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(
        quizLesson({ kind: "boss_quiz", worldId: "world_1" }),
      );
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: false }),
        servedAnswerRow({ stepIndex: 2, isCorrect: false }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 0 }));

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(mockIssueCertificateIfEligible).not.toHaveBeenCalled();
    });

    it("never issues a certificate for a non-boss-quiz lesson, even a successful one", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson({ worldId: "world_1" }));
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: true }),
        servedAnswerRow({ stepIndex: 2, isCorrect: true }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 100 }));

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(mockIssueCertificateIfEligible).not.toHaveBeenCalled();
    });

    it("a certificate-issuance failure never breaks the lesson-answer response", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(
        quizLesson({ kind: "boss_quiz", worldId: "world_1" }),
      );
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: true }),
        servedAnswerRow({ stepIndex: 2, isCorrect: true }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 100 }));
      mockIssueCertificateIfEligible.mockRejectedValueOnce(new Error("s3 boom"));

      const result = await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(result.isAttemptComplete).toBe(true);
      expect(mockLogInternalError).toHaveBeenCalledWith("certificates.issue_failed", expect.any(Error));
    });

    it("evaluates badges after a real credit, for any lesson kind - not just Boss Quiz", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson()); // plain "quiz", not boss_quiz
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: true }),
        servedAnswerRow({ stepIndex: 2, isCorrect: true }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 100 }));
      mockCreditLessonCompletion.mockResolvedValueOnce({ credited: true });

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(mockEvaluateBadgesForUser).toHaveBeenCalledWith(USER, META);
    });

    it("never evaluates badges when nothing was actually credited", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: true }),
        servedAnswerRow({ stepIndex: 2, isCorrect: true }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 100 }));
      // Default mock (credited: false) applies here.

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(mockEvaluateBadgesForUser).not.toHaveBeenCalled();
    });

    it("a badge-evaluation failure never breaks the lesson-answer response", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: true }),
        servedAnswerRow({ stepIndex: 2, isCorrect: true }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 100 }));
      mockCreditLessonCompletion.mockResolvedValueOnce({ credited: true });
      mockEvaluateBadgesForUser.mockRejectedValueOnce(new Error("boom"));

      const result = await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(result.isAttemptComplete).toBe(true);
      expect(mockLogInternalError).toHaveBeenCalledWith("badges.evaluate_failed", expect.any(Error));
    });

    it("does NOT credit a Boss Quiz that completed below the pass mark - not successful", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson({ kind: "boss_quiz" }));
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      // 0% - well below the default 60% bossQuizPassMarkPct.
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: false }),
        servedAnswerRow({ stepIndex: 2, isCorrect: false }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 0 }));

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      // completeLessonProgress still runs (D23: "completed" tracks
      // finishing, not passing) - only the credit call gets successful:false.
      expect(mockCompleteLessonProgress).toHaveBeenCalledWith(USER.id, LESSON_ID);
      expect(mockCreditLessonCompletion).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({ id: LESSON_ID, kind: "boss_quiz" }),
        false,
        META,
      );
    });

    it("passes the lesson's xpOverride/vmOverride through to creditLessonCompletion", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(
        quizLesson({ xpOverride: 999, vmOverride: 500 }),
      );
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ stepIndex: 2, timerSeconds: 10 }));
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q2_ID }));
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) =>
        Promise.resolve(servedAnswerRow({ ...input, stepIndex: 2 })),
      );
      mockListQuestionAnswersForAttempt.mockResolvedValueOnce([
        servedAnswerRow({ stepIndex: 1, isCorrect: true }),
        servedAnswerRow({ stepIndex: 2, isCorrect: true }),
      ]);
      mockCompleteAttempt.mockResolvedValueOnce(attemptRow({ status: "completed", accuracyPct: 100 }));

      await submitAnswer(USER, LESSON_ID, 2, { correctIndex: 0 }, META);

      expect(mockCreditLessonCompletion).toHaveBeenCalledWith(
        USER,
        expect.objectContaining({ xpOverride: 999, vmOverride: 500 }),
        true,
        META,
      );
    });
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

  // Cross-question leak: grading step 1 of a 2-question lesson must only
  // ever reveal step 1's own answer/explanation, never step 2's - proven by
  // checking which question/revision was actually fetched, not just the
  // response shape.
  it("only fetches and reveals THIS step's question/revision when grading - never another step's", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(quizLesson()); // questionIds: [Q1_ID, Q2_ID]
    mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
    mockGetQuestionAnswer.mockResolvedValueOnce(
      servedAnswerRow({ questionId: Q1_ID, timerSeconds: 10 }),
    );
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ id: Q1_ID }));
    mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
    mockGradeQuestionAnswer.mockImplementationOnce((input) => Promise.resolve(servedAnswerRow(input)));

    const result = await submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META);

    expect(mockGetQuestionById).toHaveBeenCalledWith(Q1_ID);
    expect(mockGetQuestionById).not.toHaveBeenCalledWith(Q2_ID);
    expect(mockGetQuestionRevision).toHaveBeenCalledWith(Q1_ID, expect.any(Number));
    expect(mockGetQuestionRevision).not.toHaveBeenCalledWith(Q2_ID, expect.any(Number));
    expect(result.correctAnswer).toEqual(questionRevisionRow().answer);
  });

  // D22 (docs/ARCHITECTURE.md): grading must use the revision that was
  // SERVED, never the current live one - a hotfix landing between serve and
  // answer must not change what an in-flight answer is graded against.
  describe("mid-flight hotfix (D22)", () => {
    it("grades against the SERVED revision's answer, ignoring a hotfix applied after serving", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      // Served while question.revision was 1 (correctIndex: 0).
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ timerSeconds: 10, servedRevision: 1 }));
      // A hotfix has since landed: the LIVE question is now revision 2 with
      // a DIFFERENT correct answer (correctIndex: 1) - format is immutable
      // so it's still fetched live for validating the submitted shape.
      mockGetQuestionById.mockResolvedValueOnce(questionRow({ revision: 2, answer: { correctIndex: 1 } }));
      // But the snapshot for the SERVED revision (1) still holds the
      // ORIGINAL answer - this is what grading must use.
      mockGetQuestionRevision.mockResolvedValueOnce(
        questionRevisionRow({ revision: 1, answer: { correctIndex: 0 } }),
      );
      mockGetPreviousQuestionAnswer.mockResolvedValueOnce(null);
      mockGradeQuestionAnswer.mockImplementationOnce((input) => Promise.resolve(servedAnswerRow(input)));

      // The learner submits what was correct when THEY were served (0) -
      // which is now "wrong" per the live, hotfixed question.
      const result = await submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META);

      expect(mockGetQuestionRevision).toHaveBeenCalledWith(Q1_ID, 1); // the served revision, not 2
      expect(result.isCorrect).toBe(true); // graded against the OLD (served) answer
      expect(result.correctAnswer).toEqual({ correctIndex: 0 }); // reveals the served revision's answer
      expect(mockGradeQuestionAnswer).toHaveBeenCalledWith(expect.objectContaining({ isCorrect: true }));
    });

    it("an idempotent replay also uses the served revision's snapshot for correctAnswer/explanation, not the live question", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(
        servedAnswerRow({ answeredAt: new Date(), isCorrect: true, xpAwardedPreview: 20, servedRevision: 1 }),
      );
      mockGetQuestionRevision.mockResolvedValueOnce(
        questionRevisionRow({ revision: 1, answer: { correctIndex: 0 }, explanation: { en: "Original explanation", hi: "x", hx: "x" } }),
      );

      const result = await submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META);

      expect(result.correctAnswer).toEqual({ correctIndex: 0 });
      expect(result.explanation).toEqual({ en: "Original explanation", hi: "x", hx: "x" });
      expect(mockGetQuestionById).not.toHaveBeenCalled(); // never needed for a replay
    });

    // Item 1 (recoverability): this should never happen once every publish/
    // hotfix snapshots a revision, but if a servedRevision somehow has no
    // matching snapshot, grading must fail loudly rather than silently
    // grade against the wrong (live) content.
    it("throws NOT_FOUND when the served revision has no recoverable snapshot", async () => {
      mockGetPublishedLesson.mockResolvedValueOnce(quizLesson());
      mockGetLatestInProgressAttempt.mockResolvedValueOnce(attemptRow());
      mockGetQuestionAnswer.mockResolvedValueOnce(servedAnswerRow({ servedRevision: 1 }));
      mockGetQuestionRevision.mockResolvedValueOnce(null);

      await expect(
        submitAnswer(USER, LESSON_ID, 1, { correctIndex: 0 }, META),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockGradeQuestionAnswer).not.toHaveBeenCalled();
    });
  });
});
