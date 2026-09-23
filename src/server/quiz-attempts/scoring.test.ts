// Pure functions - no mocks, no DB, no clock. Every anti-cheat scoring rule
// from the Checkpoint 5b kickoff is proven directly here:
// server-timed grading (elapsed is an input, never read from a client
// field), the documented latency allowance, speed bonus, combo escalation
// and cap, fever mode, and "a timeout always grades as wrong regardless of
// what was submitted."
import { describe, expect, it } from "vitest";
import type { LessonFlowScoring } from "@/server/settings/schemas";
import { answerMatches, computeScore, LATENCY_ALLOWANCE_MS } from "./scoring";

const SETTINGS: LessonFlowScoring = {
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
  tradingUnlockAfterWorldPosition: 3,
};

describe("computeScore", () => {
  it("a wrong answer awards wrongXp, no speed/combo/fever, and resets combo to 0", () => {
    const result = computeScore({
      quizKind: "popQuiz",
      answerMatches: false,
      elapsedMs: 1000,
      timerSeconds: 10,
      comboBefore: 4,
      settings: SETTINGS,
    });

    expect(result).toEqual({
      isCorrect: false,
      timedOut: false,
      speedBonusAwarded: false,
      feverActive: false,
      comboAfter: 0,
      xpAwardedPreview: 4,
    });
  });

  it("uses practiceQuiz's own base XP, distinct from popQuiz", () => {
    const correct = computeScore({
      quizKind: "practiceQuiz",
      answerMatches: true,
      elapsedMs: 14_000, // slow, no speed bonus
      timerSeconds: 15,
      comboBefore: 0,
      settings: SETTINGS,
    });
    // base 20 + comboBonusPerStep(3) x comboAfter(1) - every correct answer
    // has comboAfter >= 1, so the combo bonus is never zero on a correct answer.
    expect(correct.xpAwardedPreview).toBe(20 + 3);

    const wrong = computeScore({
      quizKind: "practiceQuiz",
      answerMatches: false,
      elapsedMs: 1000,
      timerSeconds: 15,
      comboBefore: 0,
      settings: SETTINGS,
    });
    expect(wrong.xpAwardedPreview).toBe(5); // practiceQuiz.wrongXp, not popQuiz's 4
  });

  it("awards the speed bonus when answered within the threshold %, on top of base XP", () => {
    // 10s timer, 45% threshold -> 4.5s cutoff
    const result = computeScore({
      quizKind: "popQuiz",
      answerMatches: true,
      elapsedMs: 4_000,
      timerSeconds: 10,
      comboBefore: 0,
      settings: SETTINGS,
    });

    expect(result.speedBonusAwarded).toBe(true);
    expect(result.xpAwardedPreview).toBe(20 + 10 + 3); // base + speedBonusXp + comboBonusPerStep x 1
  });

  it("does not award the speed bonus just outside the threshold", () => {
    const result = computeScore({
      quizKind: "popQuiz",
      answerMatches: true,
      elapsedMs: 4_500 + LATENCY_ALLOWANCE_MS + 1, // just past the 4.5s cutoff, allowance already applied
      timerSeconds: 10,
      comboBefore: 0,
      settings: SETTINGS,
    });

    expect(result.speedBonusAwarded).toBe(false);
    expect(result.xpAwardedPreview).toBe(20 + 3); // base + comboBonusPerStep x 1
  });

  it("subtracts the documented latency allowance before comparing against the timer (server-timed, not client-timed)", () => {
    // 10s timer -> 10_000ms budget. Measured elapsed is 10_200ms, which
    // would time out on a raw comparison, but 10_200 - LATENCY_ALLOWANCE_MS
    // (300) = 9_900ms, inside budget.
    const result = computeScore({
      quizKind: "popQuiz",
      answerMatches: true,
      elapsedMs: 10_000 + 200,
      timerSeconds: 10,
      comboBefore: 0,
      settings: SETTINGS,
    });

    expect(result.timedOut).toBe(false);
    expect(result.isCorrect).toBe(true);
  });

  it("a timeout grades as wrong even when the submitted answer matched", () => {
    const result = computeScore({
      quizKind: "popQuiz",
      answerMatches: true, // the content was actually correct...
      elapsedMs: 20_000, // ...but far too slow
      timerSeconds: 10,
      comboBefore: 3,
      settings: SETTINGS,
    });

    expect(result.timedOut).toBe(true);
    expect(result.isCorrect).toBe(false);
    expect(result.xpAwardedPreview).toBe(4); // popQuiz.wrongXp
    expect(result.comboAfter).toBe(0);
  });

  it("escalates the combo bonus with each consecutive correct answer, below the fever threshold", () => {
    const first = computeScore({
      quizKind: "popQuiz",
      answerMatches: true,
      elapsedMs: 9_000, // slow, no speed bonus - isolates the combo bonus
      timerSeconds: 10,
      comboBefore: 0,
      settings: SETTINGS,
    });
    expect(first.comboAfter).toBe(1);
    expect(first.feverActive).toBe(false);
    expect(first.xpAwardedPreview).toBe(20 + 3 * 1); // base + comboBonusPerStep x 1

    const second = computeScore({
      quizKind: "popQuiz",
      answerMatches: true,
      elapsedMs: 9_000,
      timerSeconds: 10,
      comboBefore: first.comboAfter,
      settings: SETTINGS,
    });
    expect(second.comboAfter).toBe(2);
    expect(second.feverActive).toBe(false);
    expect(second.xpAwardedPreview).toBe(20 + 3 * 2);
  });

  it("activates fever mode once combo reaches the threshold, doubling base+speed (not the combo bonus)", () => {
    // comboBefore=2 -> this answer makes comboAfter=3, the feverComboThreshold.
    const result = computeScore({
      quizKind: "popQuiz",
      answerMatches: true,
      elapsedMs: 4_000, // also earns the speed bonus, to prove fever multiplies base+speed together
      timerSeconds: 10,
      comboBefore: 2,
      settings: SETTINGS,
    });

    expect(result.comboAfter).toBe(3);
    expect(result.feverActive).toBe(true);
    expect(result.speedBonusAwarded).toBe(true);
    // (base 20 + speed 10) x fever 2 = 60, plus combo bonus 3x3=9, unmultiplied
    expect(result.xpAwardedPreview).toBe(60 + 9);
  });

  it("caps the combo bonus at comboBonusCap even as the combo keeps climbing past it", () => {
    const result = computeScore({
      quizKind: "popQuiz",
      answerMatches: true,
      elapsedMs: 9_000, // no speed bonus - isolates the combo-cap math
      timerSeconds: 10,
      comboBefore: 9, // -> comboAfter = 10, well past comboBonusCap (5)
      settings: SETTINGS,
    });

    expect(result.comboAfter).toBe(10);
    // fever active (comboAfter >= 3): base 20 x 2 = 40, + comboBonusPerStep(3) x min(10,5)=5 -> 15
    expect(result.xpAwardedPreview).toBe(40 + 15);
  });
});

describe("answerMatches", () => {
  it("single_select: compares correctIndex", () => {
    expect(answerMatches("single_select", { correctIndex: 1 }, { correctIndex: 1 })).toBe(true);
    expect(answerMatches("single_select", { correctIndex: 0 }, { correctIndex: 1 })).toBe(false);
  });

  it("ordering: compares correctOrder as a sequence", () => {
    expect(
      answerMatches("ordering", { correctOrder: [0, 1, 2] }, { correctOrder: [0, 1, 2] }),
    ).toBe(true);
    expect(
      answerMatches("ordering", { correctOrder: [1, 0, 2] }, { correctOrder: [0, 1, 2] }),
    ).toBe(false);
  });

  it("sort_buckets: compares bucketByItemIndex", () => {
    expect(
      answerMatches(
        "sort_buckets",
        { bucketByItemIndex: [0, 1, 0] },
        { bucketByItemIndex: [0, 1, 0] },
      ),
    ).toBe(true);
    expect(
      answerMatches(
        "sort_buckets",
        { bucketByItemIndex: [1, 1, 0] },
        { bucketByItemIndex: [0, 1, 0] },
      ),
    ).toBe(false);
  });

  it("fill_blank: compares correctFillIndices", () => {
    expect(
      answerMatches("fill_blank", { correctFillIndices: [2] }, { correctFillIndices: [2] }),
    ).toBe(true);
    expect(
      answerMatches("fill_blank", { correctFillIndices: [1] }, { correctFillIndices: [2] }),
    ).toBe(false);
  });

  it("match_pairs: compares rightIndexByLeftIndex", () => {
    expect(
      answerMatches(
        "match_pairs",
        { rightIndexByLeftIndex: [1, 0] },
        { rightIndexByLeftIndex: [1, 0] },
      ),
    ).toBe(true);
    expect(
      answerMatches(
        "match_pairs",
        { rightIndexByLeftIndex: [0, 0] },
        { rightIndexByLeftIndex: [1, 0] },
      ),
    ).toBe(false);
  });

  it("spot_mistake: compares wrongLineIndex", () => {
    expect(answerMatches("spot_mistake", { wrongLineIndex: 2 }, { wrongLineIndex: 2 })).toBe(true);
    expect(answerMatches("spot_mistake", { wrongLineIndex: 1 }, { wrongLineIndex: 2 })).toBe(false);
  });
});
