import { beforeEach, describe, expect, it, vi } from "vitest";

// finishAttempt's captureEvent call (docs/ARCHITECTURE.md D69) would
// otherwise pull in the real @/lib/analytics -> @/lib/env unmocked here.
vi.mock("@/lib/analytics", () => ({ captureEvent: vi.fn() }));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockGetSettingJson = vi.fn();
const mockSetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingJson: (key: unknown) => mockGetSettingJson(key),
  setSettingJson: (key: unknown, value: unknown, description?: unknown) =>
    mockSetSettingJson(key, value, description),
}));

const mockGetVmIssuanceMultiplier = vi.fn();
vi.mock("@/server/economy/service", () => ({
  getVmIssuanceMultiplier: () => mockGetVmIssuanceMultiplier(),
}));

const mockGetNewsQuizGeneratorSettings = vi.fn();
vi.mock("@/server/news/service", () => ({
  getNewsQuizGeneratorSettings: () => mockGetNewsQuizGeneratorSettings(),
}));

const mockGetTopicById = vi.fn();
vi.mock("@/server/topics/repo", () => ({
  getTopicById: (id: unknown) => mockGetTopicById(id),
}));

const mockRecordPulseCheckActivity = vi.fn();
vi.mock("@/server/streaks/service", () => ({
  recordPulseCheckActivity: (userId: unknown, at: unknown) => mockRecordPulseCheckActivity(userId, at),
}));

const mockGetActiveUserCount = vi.fn();
const mockGetAnswerByStep = vi.fn();
const mockGetAttemptById = vi.fn();
const mockGetCompletedAttemptForEdition = vi.fn();
const mockGetDailyCompletedAttemptCounts = vi.fn();
const mockGetEditionByDate = vi.fn();
const mockGetEditionById = vi.fn();
const mockGetInProgressAttempt = vi.fn();
const mockGetQuestionForServing = vi.fn();
const mockGetQuestionRevisionForGrading = vi.fn();
const mockGetStoryHeadline = vi.fn();
const mockGradeAnswerRowIfUnanswered = vi.fn();
const mockInsertAttempt = vi.fn();
const mockInsertEditionIfNew = vi.fn();
const mockInsertServedAnswerIfNew = vi.fn();
const mockListAnswersForAttempt = vi.fn();
const mockListEligibleQuestionsForEdition = vi.fn();
const mockFinishAttemptTx = vi.fn();
vi.mock("./repo", () => ({
  finishAttemptTx: (input: unknown) => mockFinishAttemptTx(input),
  getActiveUserCount: () => mockGetActiveUserCount(),
  getAnswerByStep: (a: unknown, s: unknown) => mockGetAnswerByStep(a, s),
  getAttemptById: (id: unknown) => mockGetAttemptById(id),
  getCompletedAttemptForEdition: (u: unknown, e: unknown) => mockGetCompletedAttemptForEdition(u, e),
  getDailyCompletedAttemptCounts: (since: unknown) => mockGetDailyCompletedAttemptCounts(since),
  getEditionByDate: (d: unknown) => mockGetEditionByDate(d),
  getEditionById: (id: unknown) => mockGetEditionById(id),
  getInProgressAttempt: (u: unknown, e: unknown) => mockGetInProgressAttempt(u, e),
  getQuestionForServing: (id: unknown) => mockGetQuestionForServing(id),
  getQuestionRevisionForGrading: (id: unknown, rev: unknown) => mockGetQuestionRevisionForGrading(id, rev),
  getStoryHeadline: (id: unknown) => mockGetStoryHeadline(id),
  gradeAnswerRowIfUnanswered: (a: unknown, s: unknown, r: unknown) => mockGradeAnswerRowIfUnanswered(a, s, r),
  insertAttempt: (u: unknown, e: unknown) => mockInsertAttempt(u, e),
  insertEditionIfNew: (d: unknown, ids: unknown) => mockInsertEditionIfNew(d, ids),
  insertServedAnswerIfNew: (input: unknown) => mockInsertServedAnswerIfNew(input),
  listAnswersForAttempt: (id: unknown) => mockListAnswersForAttempt(id),
  listEligibleQuestionsForEdition: (formats: unknown, limit: unknown) =>
    mockListEligibleQuestionsForEdition(formats, limit),
}));

import {
  finishAttempt,
  getCurrentPulseCheck,
  getPulseCheckEngagement,
  getPulseCheckScoring,
  getResult,
  serveStep,
  startAttempt,
  submitAnswer,
  updatePulseCheckScoring,
} from "./service";
import { DEFAULT_PULSE_CHECK_SCORING } from "./schemas";

const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1" };
const NOW = new Date("2026-09-28T06:00:00.000Z"); // ~11:30 IST

const QUIZ_SETTINGS = {
  questionCount: 8,
  perQuestionTimerSeconds: 20,
  baseVmPerQuestion: 30,
  enabledFormats: ["single_select"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSettingJson.mockResolvedValue(null); // defaults everywhere unless overridden
  mockGetNewsQuizGeneratorSettings.mockResolvedValue(QUIZ_SETTINGS);
  mockGetVmIssuanceMultiplier.mockResolvedValue(1.0);
});

describe("getPulseCheckScoring", () => {
  it("falls back to defaults when unset", async () => {
    expect(await getPulseCheckScoring()).toEqual(DEFAULT_PULSE_CHECK_SCORING);
  });
});

describe("updatePulseCheckScoring", () => {
  it("persists and logs previous/next", async () => {
    const next = { ...DEFAULT_PULSE_CHECK_SCORING, dailyVmCap: 300 };

    const result = await updatePulseCheckScoring(ACTOR, next, META);

    expect(result).toEqual(next);
    expect(mockSetSettingJson).toHaveBeenCalledWith("pulse_check_scoring", next, expect.any(String));
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "pulse_check.scoring_updated" }));
  });
});

describe("startAttempt", () => {
  it("builds today's edition on first use and creates a new attempt", async () => {
    mockGetEditionByDate.mockResolvedValueOnce(null); // no edition yet
    mockListEligibleQuestionsForEdition.mockResolvedValueOnce([{ id: "q1" }, { id: "q2" }]);
    mockInsertEditionIfNew.mockResolvedValueOnce({ id: "edition_1", questionIds: ["q1", "q2"] });
    mockGetInProgressAttempt.mockResolvedValueOnce(null);
    mockInsertAttempt.mockResolvedValueOnce({ id: "attempt_1" });

    const result = await startAttempt(USER, META, NOW);

    expect(result).toEqual({ attemptId: "attempt_1", editionId: "edition_1", totalSteps: 2, resumed: false });
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "pulse_check.attempt_started" }));
  });

  it("throws NOT_FOUND when no eligible questions exist yet", async () => {
    mockGetEditionByDate.mockResolvedValueOnce(null);
    mockListEligibleQuestionsForEdition.mockResolvedValueOnce([]);

    await expect(startAttempt(USER, META, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockInsertEditionIfNew).not.toHaveBeenCalled();
  });

  it("resumes an existing in-progress attempt rather than creating a new one, and does not log a fresh start", async () => {
    mockGetEditionByDate.mockResolvedValueOnce({ id: "edition_1", questionIds: ["q1"] });
    mockGetInProgressAttempt.mockResolvedValueOnce({ id: "attempt_existing" });

    const result = await startAttempt(USER, META, NOW);

    expect(result).toEqual({ attemptId: "attempt_existing", editionId: "edition_1", totalSteps: 1, resumed: true });
    expect(mockInsertAttempt).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("getCurrentPulseCheck", () => {
  it("returns null editionId when today's edition hasn't been built", async () => {
    mockGetEditionByDate.mockResolvedValueOnce(null);

    const result = await getCurrentPulseCheck(USER.id, NOW);

    expect(result.editionId).toBeNull();
    expect(result.alreadyCompletedToday).toBe(false);
  });

  it("reports an already-completed attempt", async () => {
    mockGetEditionByDate.mockResolvedValueOnce({ id: "edition_1", questionIds: [] });
    mockGetInProgressAttempt.mockResolvedValueOnce(null);
    mockGetCompletedAttemptForEdition.mockResolvedValueOnce({ id: "attempt_1" });

    const result = await getCurrentPulseCheck(USER.id, NOW);

    expect(result.alreadyCompletedToday).toBe(true);
  });
});

describe("serveStep", () => {
  it("blocks skipping ahead - step 2 requires step 1 to already be answered", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "e1" });
    mockGetEditionById.mockResolvedValueOnce({ id: "e1", questionIds: ["q1", "q2"], date: "2026-09-28" });
    mockGetAnswerByStep.mockResolvedValueOnce(null); // step 1 never served

    await expect(serveStep(USER, "attempt_1", 2, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("404s for an attempt belonging to a different user", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: "someone_else", status: "in_progress" });

    await expect(serveStep(USER, "attempt_1", 1, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects serving a step on an attempt whose edition is no longer today's IST date", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "e1" });
    mockGetEditionById.mockResolvedValueOnce({ id: "e1", questionIds: ["q1"], date: "2026-09-20" }); // a past day

    await expect(serveStep(USER, "attempt_1", 1, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockInsertServedAnswerIfNew).not.toHaveBeenCalled();
  });

  it("serves step 1 and includes the source headline/topic", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "e1" });
    mockGetEditionById.mockResolvedValueOnce({ id: "e1", questionIds: ["q1"], date: "2026-09-28" });
    mockGetQuestionForServing.mockResolvedValueOnce({
      id: "q1",
      format: "single_select",
      topicId: "topic_1",
      sourceStoryId: "story_1",
      prompt: { en: "P", hi: "P", hx: "P" },
      payload: { options: [] },
      revision: 1,
    });
    mockInsertServedAnswerIfNew.mockResolvedValueOnce({ timerSeconds: 20 });
    mockGetTopicById.mockResolvedValueOnce({ name: { en: "RBI", hi: "x", hx: "x" } });
    mockGetStoryHeadline.mockResolvedValueOnce({ en: "H", hi: "H", hx: "H" });

    const result = await serveStep(USER, "attempt_1", 1, NOW);

    expect(result.question.topic).toEqual({ en: "RBI", hi: "x", hx: "x" });
    expect(result.question.sourceHeadline).toEqual({ en: "H", hi: "H", hx: "H" });
  });
});

const QUESTION = {
  id: "q1",
  format: "single_select",
  topicId: null,
  sourceStoryId: null,
  revision: 1,
};
const REVISION = {
  answer: { correctIndex: 0 },
  explanation: { en: "x", hi: "x", hx: "x" },
};

describe("submitAnswer", () => {
  it("returns the original graded result on a replay, without re-scoring", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "e1" });
    mockGetEditionById.mockResolvedValueOnce({ id: "e1", questionIds: ["q1"], date: "2026-09-28" });
    mockGetAnswerByStep.mockResolvedValueOnce({
      questionId: "q1",
      servedRevision: 1,
      answeredAt: new Date(),
      isCorrect: true,
      timedOut: false,
      speedBonusAwarded: true,
      comboAfter: 1,
      vmAwardedPaise: 5000,
    });
    mockGetQuestionForServing.mockResolvedValueOnce(QUESTION);
    mockGetQuestionRevisionForGrading.mockResolvedValueOnce(REVISION);

    const result = await submitAnswer(USER, "attempt_1", 1, { correctIndex: 0 }, META, NOW);

    expect(result.vmAwarded).toBe(50);
    expect(mockGradeAnswerRowIfUnanswered).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled(); // replay writes nothing, so nothing is logged
  });

  it("rejects serving a step on an attempt whose edition is no longer today's IST date", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "e1" });
    mockGetEditionById.mockResolvedValueOnce({ id: "e1", questionIds: ["q1"], date: "2026-09-20" }); // a past day

    await expect(submitAnswer(USER, "attempt_1", 1, { correctIndex: 0 }, META, NOW)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mockGetAnswerByStep).not.toHaveBeenCalled();
  });

  it("rejects a structurally invalid answer for the question's format", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "e1" });
    mockGetEditionById.mockResolvedValueOnce({ id: "e1", questionIds: ["q1"], date: "2026-09-28" });
    mockGetAnswerByStep.mockResolvedValueOnce({
      questionId: "q1",
      servedRevision: 1,
      answeredAt: null,
      servedAt: NOW,
      timerSeconds: 20,
    });
    mockGetQuestionForServing.mockResolvedValueOnce(QUESTION);
    mockGetQuestionRevisionForGrading.mockResolvedValueOnce(REVISION);

    await expect(submitAnswer(USER, "attempt_1", 1, { notAValidShape: true }, META, NOW)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("grades a fresh answer, stores it in paise, and logs the mutation", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "e1" });
    mockGetEditionById.mockResolvedValueOnce({ id: "e1", questionIds: ["q1"], date: "2026-09-28" });
    mockGetAnswerByStep.mockResolvedValueOnce({
      questionId: "q1",
      servedRevision: 1,
      answeredAt: null,
      servedAt: new Date(NOW.getTime() - 5000),
      timerSeconds: 20,
    });
    mockGetQuestionForServing.mockResolvedValueOnce(QUESTION);
    mockGetQuestionRevisionForGrading.mockResolvedValueOnce(REVISION);
    mockGradeAnswerRowIfUnanswered.mockResolvedValueOnce({
      isCorrect: true,
      timedOut: false,
      speedBonusAwarded: true,
      comboAfter: 1,
      vmAwardedPaise: 5000,
    });

    const result = await submitAnswer(USER, "attempt_1", 1, { correctIndex: 0 }, META, NOW);

    expect(result.isCorrect).toBe(true);
    expect(result.vmAwarded).toBe(50);
    expect(mockGradeAnswerRowIfUnanswered).toHaveBeenCalledWith(
      "attempt_1",
      1,
      expect.objectContaining({ vmAwardedPaise: 5000 }), // 30 base + 15 speed + 5 combo = 50 VM = 5000 paise
    );
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "pulse_check.step_answered" }));
  });
});

// --- finishAttempt: computes the raw VM total and delegates the actual
// cap-clamping/crediting to finishAttemptTx (repo.ts). D51's cap arithmetic
// itself - under/at/over/mid-day-change, and the concurrency fix - is now
// proven against real Postgres in repo.test.ts, since a mocked unit test
// fundamentally can't verify a row lock actually serializes two
// transactions. These tests instead prove finishAttempt (a) computes the
// right inputs and hands them to finishAttemptTx, and (b) correctly
// surfaces/acts on whatever finishAttemptTx reports. ---

const ATTEMPT = { id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "edition_1" };
const EDITION = { id: "edition_1", questionIds: ["q1", "q2"], date: "2026-09-28" }; // matches NOW's IST date
function answeredRows(vmPaiseList: number[]) {
  return vmPaiseList.map((vmAwardedPaise, i) => ({
    stepIndex: i + 1,
    answeredAt: new Date(),
    isCorrect: true,
    comboAfter: i + 1,
    vmAwardedPaise,
  }));
}

describe("finishAttempt", () => {
  beforeEach(() => {
    mockGetAttemptById.mockResolvedValue(ATTEMPT);
    mockGetEditionById.mockResolvedValue(EDITION);
    mockFinishAttemptTx.mockImplementation(async (input) => ({
      completed: { ...ATTEMPT, status: "completed", totalVmAwardedPaise: input.rawVmEarnedPaise, dailyCapReached: false },
      totalVmAwardedPaise: input.rawVmEarnedPaise,
      dailyCapReached: false,
    }));
  });

  it("computes the raw VM total (answers + all-correct bonus, multiplier applied) and the cap in paise, and hands both to finishAttemptTx", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ ...DEFAULT_PULSE_CHECK_SCORING, allCorrectBonusVm: 100, dailyVmCap: 300 });
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([5000, 5000])); // both correct - all-correct bonus fires
    mockGetVmIssuanceMultiplier.mockResolvedValueOnce(1.0);

    await finishAttempt(USER, "attempt_1", META, NOW);

    expect(mockFinishAttemptTx).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER.id,
        attemptId: "attempt_1",
        at: NOW,
        dailyCapPaise: 30_000, // 300 VM cap * 100 paise/VM
        accuracyPct: 100,
        bestCombo: 2,
        allCorrectBonusAwarded: true,
        rawVmEarnedPaise: 20_000, // 5000 + 5000 answers + 10,000 (100 VM bonus), all in paise
        multiplierApplied: 1.0,
      }),
    );
  });

  it("applies the global VM issuance multiplier once, to the raw total, before handing it to finishAttemptTx", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ ...DEFAULT_PULSE_CHECK_SCORING, allCorrectBonusVm: 0, dailyVmCap: 1000 });
    mockGetVmIssuanceMultiplier.mockResolvedValueOnce(2.0);
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([2500, 2500])); // 50 VM raw

    await finishAttempt(USER, "attempt_1", META, NOW);

    expect(mockFinishAttemptTx).toHaveBeenCalledWith(
      expect.objectContaining({ rawVmEarnedPaise: 10_000, multiplierApplied: 2.0 }), // 50 VM * 2.0 = 100 VM = 10,000 paise
    );
  });

  it("surfaces totalVmAwardedPaise and dailyCapReached exactly as finishAttemptTx reports them", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ ...DEFAULT_PULSE_CHECK_SCORING, allCorrectBonusVm: 0, dailyVmCap: 60 });
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([5000, 5000]));
    mockFinishAttemptTx.mockResolvedValueOnce({
      completed: { ...ATTEMPT, status: "completed", totalVmAwardedPaise: 6000, dailyCapReached: true },
      totalVmAwardedPaise: 6000,
      dailyCapReached: true,
    });

    const result = await finishAttempt(USER, "attempt_1", META, NOW);

    // Not silently a smaller number with no explanation - dailyCapReached
    // surfaces exactly what finishAttemptTx decided, unmodified.
    expect(result.totalVmAwardedPaise).toBe(6000);
    expect(result.dailyCapReached).toBe(true);
  });

  it("still records the streak and logs the mutation when the attempt completes, even if the cap clamped the credit to 0", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_PULSE_CHECK_SCORING);
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([1500, 1500]));
    mockFinishAttemptTx.mockResolvedValueOnce({
      completed: { ...ATTEMPT, status: "completed", totalVmAwardedPaise: 0, dailyCapReached: true },
      totalVmAwardedPaise: 0,
      dailyCapReached: true,
    });

    const result = await finishAttempt(USER, "attempt_1", META, NOW);

    expect(result.totalVmAwardedPaise).toBe(0);
    expect(mockRecordPulseCheckActivity).toHaveBeenCalledWith(USER.id, NOW); // streak still counts
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "pulse_check.attempt_finished" }));
  });

  it("never records the streak or logs when finishAttemptTx loses the race (a concurrent duplicate finish for this exact attempt)", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_PULSE_CHECK_SCORING);
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([5000, 5000]));
    mockFinishAttemptTx.mockResolvedValueOnce({ completed: null, totalVmAwardedPaise: 0, dailyCapReached: false });
    mockGetAttemptById
      .mockResolvedValueOnce(ATTEMPT)
      .mockResolvedValueOnce({ ...ATTEMPT, status: "completed", totalVmAwardedPaise: 10_000 });

    await finishAttempt(USER, "attempt_1", META, NOW);

    expect(mockRecordPulseCheckActivity).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("is idempotent - finishing an already-completed attempt returns the stored result and never calls finishAttemptTx", async () => {
    mockGetAttemptById.mockResolvedValueOnce({
      ...ATTEMPT,
      status: "completed",
      accuracyPct: 100,
      bestCombo: 2,
      allCorrectBonusAwarded: true,
      rawVmEarnedPaise: 10_000,
      totalVmAwardedPaise: 10_000,
      dailyCapReached: false,
    });

    const result = await finishAttempt(USER, "attempt_1", META, NOW);

    expect(result.totalVmAwardedPaise).toBe(10_000);
    expect(mockFinishAttemptTx).not.toHaveBeenCalled();
    expect(mockListAnswersForAttempt).not.toHaveBeenCalled();
  });

  it("throws CONFLICT if not every question has been answered yet", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_PULSE_CHECK_SCORING);
    mockListAnswersForAttempt.mockResolvedValueOnce([{ stepIndex: 1, answeredAt: new Date() }]); // 1 of 2 answered

    await expect(finishAttempt(USER, "attempt_1", META, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockFinishAttemptTx).not.toHaveBeenCalled();
  });

  // D51 root-cause fix: closes the exploit the cap race depended on - a
  // learner leaving an attempt in_progress past its edition's IST day can
  // never finish it for credit, so concurrent finishes across several
  // stale editions (the scenario the security audit found) can no longer
  // even reach finishAttemptTx in the first place.
  it("throws CONFLICT (expired) when the attempt's edition is no longer today's IST date", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ ...ATTEMPT, editionId: "stale_edition" });
    mockGetEditionById.mockResolvedValueOnce({ id: "stale_edition", questionIds: ["q1", "q2"], date: "2026-09-20" });

    await expect(finishAttempt(USER, "attempt_1", META, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockFinishAttemptTx).not.toHaveBeenCalled();
  });
});

describe("getResult", () => {
  it("throws CONFLICT if the attempt isn't finished yet", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress" });

    await expect(getResult(USER, "attempt_1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns the summary and per-answer breakdown for a completed attempt", async () => {
    mockGetAttemptById.mockResolvedValueOnce({
      id: "attempt_1",
      userId: USER.id,
      status: "completed",
      accuracyPct: 100,
      bestCombo: 2,
      allCorrectBonusAwarded: true,
      rawVmEarnedPaise: 10_000,
      totalVmAwardedPaise: 10_000,
      dailyCapReached: false,
    });
    mockListAnswersForAttempt.mockResolvedValueOnce([
      { stepIndex: 1, isCorrect: true, timedOut: false, speedBonusAwarded: true, vmAwardedPaise: 5000 },
    ]);

    const result = await getResult(USER, "attempt_1");

    expect(result.answers[0].vmAwarded).toBe(50);
  });
});

describe("getPulseCheckEngagement", () => {
  it("fills every day in the window with 0% when there's no data, and computes the average", async () => {
    mockGetDailyCompletedAttemptCounts.mockResolvedValueOnce([]);
    mockGetActiveUserCount.mockResolvedValueOnce(100);

    const result = await getPulseCheckEngagement(7, NOW);

    expect(result.daily).toHaveLength(7);
    expect(result.daily.every((d) => d.pct === 0)).toBe(true);
    expect(result.averagePct).toBe(0);
  });

  it("computes each day's % from distinct completed-attempt users over the active user count", async () => {
    mockGetDailyCompletedAttemptCounts.mockResolvedValueOnce([
      { date: "2026-09-28", distinctUsers: 25 },
      { date: "2026-09-27", distinctUsers: 50 },
    ]);
    mockGetActiveUserCount.mockResolvedValueOnce(100);

    const result = await getPulseCheckEngagement(7, NOW);

    const today = result.daily.find((d) => d.date === "2026-09-28");
    const yesterday = result.daily.find((d) => d.date === "2026-09-27");
    expect(today?.pct).toBe(25);
    expect(yesterday?.pct).toBe(50);
  });

  it("returns 0% everywhere (never divides by zero) when there are no active users", async () => {
    mockGetDailyCompletedAttemptCounts.mockResolvedValueOnce([{ date: "2026-09-28", distinctUsers: 0 }]);
    mockGetActiveUserCount.mockResolvedValueOnce(0);

    const result = await getPulseCheckEngagement(7, NOW);

    expect(result.daily.every((d) => d.pct === 0)).toBe(true);
  });
});
