import { describe, expect, it } from "vitest";
import {
  computeConsistency,
  computeEfficiencyScore,
  computeModuleBreakdown,
  computeQuizAccuracy,
  computeRetention,
  computeTopicMastery,
  computeWatchSpeed,
} from "./metrics";

const WEEK_START = new Date("2026-09-21T00:00:00Z");
const WEEK_END = new Date("2026-09-28T00:00:00Z");

describe("computeRetention", () => {
  it("falls back to current quiz accuracy when there's no repeat-exposure data yet", () => {
    const history = [{ answeredAt: new Date("2026-09-22T00:00:00Z"), topic: "budgeting", isCorrect: true }];
    expect(computeRetention(history, WEEK_START, WEEK_END, 77)).toBe(77);
  });

  it("scores only repeat answers that fall inside the report week, ignoring the first exposure", () => {
    const history = [
      // first exposure, before the week - never counted, even though it's "in history"
      { answeredAt: new Date("2026-09-10T00:00:00Z"), topic: "budgeting", isCorrect: false },
      // repeat exposure, inside the week - counted
      { answeredAt: new Date("2026-09-23T00:00:00Z"), topic: "budgeting", isCorrect: true },
      // another topic's first exposure, inside the week - never counted (it's a first exposure, not a repeat)
      { answeredAt: new Date("2026-09-24T00:00:00Z"), topic: "saving", isCorrect: false },
    ];
    expect(computeRetention(history, WEEK_START, WEEK_END, 0)).toBe(100);
  });

  it("ignores rows with a null topic or null answeredAt", () => {
    const history = [
      { answeredAt: null, topic: "budgeting", isCorrect: true },
      { answeredAt: new Date("2026-09-22T00:00:00Z"), topic: null, isCorrect: true },
    ];
    expect(computeRetention(history, WEEK_START, WEEK_END, 42)).toBe(42);
  });
});

describe("computeQuizAccuracy", () => {
  it("returns the percent correct among answered questions", () => {
    const answers = [
      { answeredAt: new Date(), topic: "x", isCorrect: true },
      { answeredAt: new Date(), topic: "x", isCorrect: true },
      { answeredAt: new Date(), topic: "x", isCorrect: false },
      { answeredAt: new Date(), topic: "x", isCorrect: false },
    ];
    expect(computeQuizAccuracy(answers)).toBe(50);
  });

  it("returns 0 when nothing was answered this week", () => {
    expect(computeQuizAccuracy([])).toBe(0);
  });
});

describe("computeWatchSpeed", () => {
  it("defaults to 100 (no penalty) when no video was completed this week", () => {
    expect(computeWatchSpeed([])).toBe(100);
  });

  it("scores 100 when watched exactly at the video's length", () => {
    const attempts = [
      {
        startedAt: new Date("2026-09-22T00:00:00Z"),
        completedAt: new Date("2026-09-22T00:02:00Z"), // 120s
        content: { lengthSeconds: 120, scenes: [], cues: [] },
      },
    ];
    expect(computeWatchSpeed(attempts)).toBe(100);
  });

  it("clamps at 100 even if watched faster than the video's length", () => {
    const attempts = [
      {
        startedAt: new Date("2026-09-22T00:00:00Z"),
        completedAt: new Date("2026-09-22T00:01:00Z"), // 60s actual, 120s video
        content: { lengthSeconds: 120, scenes: [], cues: [] },
      },
    ];
    expect(computeWatchSpeed(attempts)).toBe(100);
  });

  it("scores below 100 when it took longer than the video's length", () => {
    const attempts = [
      {
        startedAt: new Date("2026-09-22T00:00:00Z"),
        completedAt: new Date("2026-09-22T00:04:00Z"), // 240s actual, 120s video -> 50%
        content: { lengthSeconds: 120, scenes: [], cues: [] },
      },
    ];
    expect(computeWatchSpeed(attempts)).toBe(50);
  });

  it("skips an attempt with no completedAt or malformed content", () => {
    const attempts = [
      { startedAt: new Date(), completedAt: null, content: { lengthSeconds: 120, scenes: [], cues: [] } },
      { startedAt: new Date(), completedAt: new Date(), content: { not: "a video" } },
    ];
    expect(computeWatchSpeed(attempts)).toBe(100);
  });
});

describe("computeConsistency", () => {
  it("computes active days / period days as a percent", () => {
    expect(computeConsistency(3, 7)).toBe(43);
  });

  it("returns 100 for a perfect week", () => {
    expect(computeConsistency(7, 7)).toBe(100);
  });
});

describe("computeEfficiencyScore", () => {
  it("averages the four sub-metrics", () => {
    expect(
      computeEfficiencyScore({ retention: 80, watchSpeed: 100, quizAccuracy: 60, consistency: 40 }),
    ).toBe(70);
  });
});

describe("computeModuleBreakdown", () => {
  it("groups completions and accuracy by world, and letter-grades each row", () => {
    const completions = [
      {
        worldId: "world_1",
        lessonId: "l1",
        startedAt: new Date("2026-09-22T00:00:00Z"),
        completedAt: new Date("2026-09-22T00:05:00Z"),
      },
    ];
    const answers = [
      { worldId: "world_1", isCorrect: true },
      { worldId: "world_1", isCorrect: true },
    ];
    const rows = computeModuleBreakdown(completions, answers, new Map([["world_1", "Money Wise"]]));

    expect(rows).toEqual([
      {
        worldId: "world_1",
        worldTitle: "Money Wise",
        lessonsCompleted: 1,
        minutesSpent: 5,
        accuracyPct: 100,
        grade: "S",
      },
    ]);
  });

  it("skips a completion with no completedAt", () => {
    const completions = [{ worldId: "world_1", lessonId: "l1", startedAt: new Date(), completedAt: null }];
    expect(computeModuleBreakdown(completions, [], new Map())).toEqual([]);
  });

  it("falls back to 'Unknown world' when the title map has no entry", () => {
    const completions = [
      { worldId: "world_9", lessonId: "l1", startedAt: new Date(), completedAt: new Date() },
    ];
    const rows = computeModuleBreakdown(completions, [], new Map());
    expect(rows[0]?.worldTitle).toBe("Unknown world");
  });
});

describe("computeTopicMastery", () => {
  it("computes per-topic accuracy for the report week", () => {
    const answers = [
      { answeredAt: new Date(), topic: "budgeting", isCorrect: true },
      { answeredAt: new Date(), topic: "budgeting", isCorrect: false },
      { answeredAt: new Date(), topic: "saving", isCorrect: true },
    ];
    const rows = computeTopicMastery(answers);
    expect(rows).toEqual(
      expect.arrayContaining([
        { topic: "budgeting", accuracyPct: 50 },
        { topic: "saving", accuracyPct: 100 },
      ]),
    );
  });

  it("ignores rows with a null topic or unanswered rows", () => {
    const answers = [
      { answeredAt: new Date(), topic: null, isCorrect: true },
      { answeredAt: null, topic: "budgeting", isCorrect: true },
    ];
    expect(computeTopicMastery(answers)).toEqual([]);
  });
});
