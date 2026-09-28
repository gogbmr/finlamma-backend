import { describe, expect, it } from "vitest";
import { computePulseCheckAnswerScore } from "./scoring";

const SETTINGS = {
  speedBonusThresholdPct: 45,
  speedBonusVm: 15,
  comboBonusPerStep: 5,
  comboBonusCap: 5,
  allCorrectBonusVm: 100,
  dailyVmCap: 200,
};

const BASE_INPUT = {
  format: "single_select" as const,
  submittedAnswer: { correctIndex: 0 },
  correctAnswer: { correctIndex: 0 },
  timerSeconds: 20,
  comboBefore: 0,
  settings: SETTINGS,
  baseVm: 30,
};

describe("computePulseCheckAnswerScore", () => {
  it("a wrong answer earns 0 VM and resets combo to 0", () => {
    const result = computePulseCheckAnswerScore({
      ...BASE_INPUT,
      submittedAnswer: { correctIndex: 1 },
      elapsedMs: 3000,
    });
    expect(result).toEqual({ isCorrect: false, timedOut: false, speedBonusAwarded: false, comboAfter: 0, vmAwarded: 0 });
  });

  it("a correct answer past the timer counts as timed out and wrong, even if the answer matches", () => {
    const result = computePulseCheckAnswerScore({ ...BASE_INPUT, elapsedMs: 25_000 });
    expect(result.isCorrect).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.vmAwarded).toBe(0);
  });

  it("correct + fast (within 45% of the timer) awards base + speed bonus + first-step combo", () => {
    // 45% of 20s = 9000ms
    const result = computePulseCheckAnswerScore({ ...BASE_INPUT, elapsedMs: 8000 });
    expect(result.isCorrect).toBe(true);
    expect(result.speedBonusAwarded).toBe(true);
    expect(result.comboAfter).toBe(1);
    // 30 base + 15 speed + (5 * min(1,5)) combo = 50
    expect(result.vmAwarded).toBe(50);
  });

  it("correct but slow (past the speed threshold) awards no speed bonus", () => {
    const result = computePulseCheckAnswerScore({ ...BASE_INPUT, elapsedMs: 15_000 });
    expect(result.isCorrect).toBe(true);
    expect(result.speedBonusAwarded).toBe(false);
    // 30 base + 0 speed + 5 combo = 35
    expect(result.vmAwarded).toBe(35);
  });

  it("combo bonus escalates with comboBefore, capped at comboBonusCap", () => {
    const at4 = computePulseCheckAnswerScore({ ...BASE_INPUT, elapsedMs: 8000, comboBefore: 4 });
    expect(at4.comboAfter).toBe(5);
    expect(at4.vmAwarded).toBe(30 + 15 + 5 * 5); // combo maxed at 5 steps

    const at10 = computePulseCheckAnswerScore({ ...BASE_INPUT, elapsedMs: 8000, comboBefore: 10 });
    expect(at10.comboAfter).toBe(11);
    // still capped at comboBonusCap (5), never keeps growing past it
    expect(at10.vmAwarded).toBe(30 + 15 + 5 * 5);
  });

  it("the 300ms latency allowance is subtracted before comparing against the timer", () => {
    // 20_000ms timer, answered at exactly 20_250ms elapsed - within the
    // 300ms grace period, so effectively 19_950ms, not timed out.
    const result = computePulseCheckAnswerScore({ ...BASE_INPUT, elapsedMs: 20_250 });
    expect(result.timedOut).toBe(false);
  });
});
