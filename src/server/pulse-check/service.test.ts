import { beforeEach, describe, expect, it, vi } from "vitest";

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

const mockCreditVmoneyRow = vi.fn();
vi.mock("@/server/economy/repo", () => ({
  creditVmoneyRow: (input: unknown) => mockCreditVmoneyRow(input),
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
const mockMarkAttemptCompleted = vi.fn();
const mockSumPulseCheckVmCreditedToday = vi.fn();
vi.mock("./repo", () => ({
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
  markAttemptCompleted: (id: unknown, result: unknown) => mockMarkAttemptCompleted(id, result),
  sumPulseCheckVmCreditedToday: (userId: unknown, at: unknown) => mockSumPulseCheckVmCreditedToday(userId, at),
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

    const result = await startAttempt(USER, NOW);

    expect(result).toEqual({ attemptId: "attempt_1", editionId: "edition_1", totalSteps: 2, resumed: false });
  });

  it("throws NOT_FOUND when no eligible questions exist yet", async () => {
    mockGetEditionByDate.mockResolvedValueOnce(null);
    mockListEligibleQuestionsForEdition.mockResolvedValueOnce([]);

    await expect(startAttempt(USER, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockInsertEditionIfNew).not.toHaveBeenCalled();
  });

  it("resumes an existing in-progress attempt rather than creating a new one", async () => {
    mockGetEditionByDate.mockResolvedValueOnce({ id: "edition_1", questionIds: ["q1"] });
    mockGetInProgressAttempt.mockResolvedValueOnce({ id: "attempt_existing" });

    const result = await startAttempt(USER, NOW);

    expect(result).toEqual({ attemptId: "attempt_existing", editionId: "edition_1", totalSteps: 1, resumed: true });
    expect(mockInsertAttempt).not.toHaveBeenCalled();
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
    mockGetEditionById.mockResolvedValueOnce({ id: "e1", questionIds: ["q1", "q2"] });
    mockGetAnswerByStep.mockResolvedValueOnce(null); // step 1 never served

    await expect(serveStep(USER, "attempt_1", 2)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("404s for an attempt belonging to a different user", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: "someone_else", status: "in_progress" });

    await expect(serveStep(USER, "attempt_1", 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("serves step 1 and includes the source headline/topic", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "e1" });
    mockGetEditionById.mockResolvedValueOnce({ id: "e1", questionIds: ["q1"] });
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

    const result = await serveStep(USER, "attempt_1", 1);

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
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress" });
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

    const result = await submitAnswer(USER, "attempt_1", 1, { correctIndex: 0 }, NOW);

    expect(result.vmAwarded).toBe(50);
    expect(mockGradeAnswerRowIfUnanswered).not.toHaveBeenCalled();
  });

  it("rejects a structurally invalid answer for the question's format", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress" });
    mockGetAnswerByStep.mockResolvedValueOnce({
      questionId: "q1",
      servedRevision: 1,
      answeredAt: null,
      servedAt: NOW,
      timerSeconds: 20,
    });
    mockGetQuestionForServing.mockResolvedValueOnce(QUESTION);
    mockGetQuestionRevisionForGrading.mockResolvedValueOnce(REVISION);

    await expect(submitAnswer(USER, "attempt_1", 1, { notAValidShape: true }, NOW)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("grades a fresh answer and stores it in paise", async () => {
    mockGetAttemptById.mockResolvedValueOnce({ id: "attempt_1", userId: USER.id, status: "in_progress" });
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

    const result = await submitAnswer(USER, "attempt_1", 1, { correctIndex: 0 }, NOW);

    expect(result.isCorrect).toBe(true);
    expect(result.vmAwarded).toBe(50);
    expect(mockGradeAnswerRowIfUnanswered).toHaveBeenCalledWith(
      "attempt_1",
      1,
      expect.objectContaining({ vmAwardedPaise: 5000 }), // 30 base + 15 speed + 5 combo = 50 VM = 5000 paise
    );
  });
});

// --- D51's daily VM cap: under, at, over, and a mid-day cap change ---

const ATTEMPT = { id: "attempt_1", userId: USER.id, status: "in_progress", editionId: "edition_1" };
const EDITION = { id: "edition_1", questionIds: ["q1", "q2"] };
function answeredRows(vmPaiseList: number[]) {
  return vmPaiseList.map((vmAwardedPaise, i) => ({
    stepIndex: i + 1,
    answeredAt: new Date(),
    isCorrect: true,
    comboAfter: i + 1,
    vmAwardedPaise,
  }));
}

describe("finishAttempt - D51 daily VM cap", () => {
  beforeEach(() => {
    mockGetAttemptById.mockResolvedValue(ATTEMPT);
    mockGetEditionById.mockResolvedValue(EDITION);
    mockMarkAttemptCompleted.mockImplementation(async (id, result) => ({ ...ATTEMPT, ...result, status: "completed" }));
  });

  // allCorrectBonusVm: 0 throughout - isolates the cap-clamping arithmetic
  // from the separate all-correct bonus (both rows below are correct, so
  // the bonus would otherwise also fire and complicate the expected sums).
  // EDITION has 2 questionIds, so every answeredRows() array here has 2
  // entries to satisfy finishAttempt's "every question answered" check.

  it("under the cap: the full raw amount is credited, dailyCapReached is false", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ ...DEFAULT_PULSE_CHECK_SCORING, allCorrectBonusVm: 0, dailyVmCap: 300 });
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([5000, 5000])); // 100 VM raw
    mockSumPulseCheckVmCreditedToday.mockResolvedValueOnce(0);

    const result = await finishAttempt(USER, "attempt_1", META, NOW);

    expect(result.rawVmEarnedPaise).toBe(10_000); // 100 VM
    expect(result.totalVmAwardedPaise).toBe(10_000);
    expect(result.dailyCapReached).toBe(false);
    expect(mockCreditVmoneyRow).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: 10_000, sourceType: "pulse_check_attempt", sourceId: "edition_1" }),
    );
  });

  it("exactly at the cap: fully credited, dailyCapReached is false (nothing was actually cut)", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ ...DEFAULT_PULSE_CHECK_SCORING, allCorrectBonusVm: 0, dailyVmCap: 100 });
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([5000, 5000])); // 100 VM raw = cap exactly
    mockSumPulseCheckVmCreditedToday.mockResolvedValueOnce(0);

    const result = await finishAttempt(USER, "attempt_1", META, NOW);

    expect(result.rawVmEarnedPaise).toBe(10_000);
    expect(result.totalVmAwardedPaise).toBe(10_000);
    expect(result.dailyCapReached).toBe(false);
  });

  it("over the cap: credited amount is clamped, dailyCapReached is true, result is not silently a smaller number with no explanation", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ ...DEFAULT_PULSE_CHECK_SCORING, allCorrectBonusVm: 0, dailyVmCap: 60 });
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([5000, 5000])); // 100 VM raw, cap 60
    mockSumPulseCheckVmCreditedToday.mockResolvedValueOnce(0);

    const result = await finishAttempt(USER, "attempt_1", META, NOW);

    expect(result.rawVmEarnedPaise).toBe(10_000);
    expect(result.totalVmAwardedPaise).toBe(6000); // clamped to the 60 VM cap
    expect(result.dailyCapReached).toBe(true);
    expect(mockCreditVmoneyRow).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 6000 }));
  });

  it("the quiz still runs, still completes, and still counts for the streak even when the cap was already fully used today", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ ...DEFAULT_PULSE_CHECK_SCORING, allCorrectBonusVm: 0, dailyVmCap: 50 });
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([1500, 1500])); // 30 VM raw
    mockSumPulseCheckVmCreditedToday.mockResolvedValueOnce(5000); // already earned 50 VM today (the cap)

    const result = await finishAttempt(USER, "attempt_1", META, NOW);

    expect(result.totalVmAwardedPaise).toBe(0);
    expect(result.dailyCapReached).toBe(true);
    expect(mockCreditVmoneyRow).not.toHaveBeenCalled(); // nothing to credit, no zero-amount ledger row
    expect(mockRecordPulseCheckActivity).toHaveBeenCalledWith(USER.id, NOW); // streak still counts
    expect(mockMarkAttemptCompleted).toHaveBeenCalled(); // attempt still completes normally
  });

  it("a cap change mid-day is read live: raising the cap after an earlier credit allows more to be earned", async () => {
    // Earlier today: cap was 50, already credited 50. Now staff raises the
    // cap to 150 before this attempt finishes - the raised value must be
    // what governs this credit, not a stale cached one.
    mockGetSettingJson.mockResolvedValueOnce({ ...DEFAULT_PULSE_CHECK_SCORING, allCorrectBonusVm: 0, dailyVmCap: 150 });
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([3000, 3000])); // 60 VM raw
    mockSumPulseCheckVmCreditedToday.mockResolvedValueOnce(5000); // 50 VM already credited today

    const result = await finishAttempt(USER, "attempt_1", META, NOW);

    // remaining cap = 150 - 50 = 100, raw earned = 60, so fully credited
    expect(result.totalVmAwardedPaise).toBe(6000);
    expect(result.dailyCapReached).toBe(false);
  });

  it("applies the global VM issuance multiplier once, to the attempt total, before the cap", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ ...DEFAULT_PULSE_CHECK_SCORING, allCorrectBonusVm: 0, dailyVmCap: 1000 });
    mockGetVmIssuanceMultiplier.mockResolvedValueOnce(2.0);
    mockListAnswersForAttempt.mockResolvedValueOnce(answeredRows([2500, 2500])); // 50 VM raw
    mockSumPulseCheckVmCreditedToday.mockResolvedValueOnce(0);

    const result = await finishAttempt(USER, "attempt_1", META, NOW);

    expect(result.rawVmEarnedPaise).toBe(10_000); // 50 VM * 2.0 multiplier = 100 VM
    expect(mockCreditVmoneyRow).toHaveBeenCalledWith(expect.objectContaining({ multiplierApplied: 2.0 }));
  });

  it("is idempotent - finishing an already-completed attempt returns the stored result and credits nothing again", async () => {
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
    expect(mockCreditVmoneyRow).not.toHaveBeenCalled();
    expect(mockListAnswersForAttempt).not.toHaveBeenCalled();
  });

  it("throws CONFLICT if not every question has been answered yet", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_PULSE_CHECK_SCORING);
    mockListAnswersForAttempt.mockResolvedValueOnce([{ stepIndex: 1, answeredAt: new Date() }]); // 1 of 2 answered

    await expect(finishAttempt(USER, "attempt_1", META, NOW)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockMarkAttemptCompleted).not.toHaveBeenCalled();
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
