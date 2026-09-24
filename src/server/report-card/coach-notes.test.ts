import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPublishedCoachNoteTemplatesByCategory = vi.fn();
vi.mock("./repo", () => ({
  getPublishedCoachNoteTemplatesByCategory: (category: unknown) =>
    mockGetPublishedCoachNoteTemplatesByCategory(category),
}));

import {
  pickCoachNoteTemplate,
  pickGapMetric,
  pickHabitDetail,
  pickOpportunityTopic,
  pickStrengthMetric,
} from "./coach-notes";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pickStrengthMetric / pickGapMetric", () => {
  it("picks the highest-scoring sub-metric as the strength", () => {
    const subMetrics = { retention: 40, watchSpeed: 90, quizAccuracy: 60, consistency: 30 };
    expect(pickStrengthMetric(subMetrics)).toBe("watchSpeed");
  });

  it("picks the lowest-scoring sub-metric as the gap", () => {
    const subMetrics = { retention: 40, watchSpeed: 90, quizAccuracy: 60, consistency: 30 };
    expect(pickGapMetric(subMetrics)).toBe("consistency");
  });
});

describe("pickOpportunityTopic", () => {
  const NOW = new Date("2026-09-24T00:00:00Z");

  it("returns null when there's no topic history at all", () => {
    expect(pickOpportunityTopic([], NOW)).toBeNull();
  });

  it("prefers a stale topic (not answered in the last 14 days) over a fresh one", () => {
    const history = [
      // stale: last answered 20 days ago, 100% accuracy
      { answeredAt: new Date("2026-09-04T00:00:00Z"), topic: "budgeting", isCorrect: true },
      // fresh: answered today, 0% accuracy - lower accuracy, but not stale
      { answeredAt: new Date("2026-09-24T00:00:00Z"), topic: "saving", isCorrect: false },
    ];
    expect(pickOpportunityTopic(history, NOW)).toEqual({ topic: "budgeting", accuracyPct: 100 });
  });

  it("falls back to the lowest-mastery topic among all topics when none are stale", () => {
    const history = [
      { answeredAt: new Date("2026-09-23T00:00:00Z"), topic: "budgeting", isCorrect: true },
      { answeredAt: new Date("2026-09-23T00:00:00Z"), topic: "saving", isCorrect: false },
    ];
    expect(pickOpportunityTopic(history, NOW)).toEqual({ topic: "saving", accuracyPct: 0 });
  });

  it("ignores rows with a null topic or null answeredAt", () => {
    const history = [
      { answeredAt: null, topic: "budgeting", isCorrect: true },
      { answeredAt: new Date("2026-09-23T00:00:00Z"), topic: null, isCorrect: true },
    ];
    expect(pickOpportunityTopic(history, NOW)).toBeNull();
  });
});

describe("pickHabitDetail", () => {
  it("flags a broken streak, taking priority over a best-weekday pick", () => {
    const result = pickHabitDetail(
      [{ completedAt: new Date("2026-09-22T00:00:00Z") }],
      { current: 0, longest: 5 },
    );
    expect(result).toEqual({ bestWeekday: null, streakBroken: true });
  });

  it("never flags a broken streak when the longest streak is also 0 (never had one)", () => {
    const result = pickHabitDetail([], { current: 0, longest: 0 });
    expect(result.streakBroken).toBe(false);
  });

  it("picks the weekday with the most completions", () => {
    // 2026-09-21 is a Monday (UTC)
    const result = pickHabitDetail(
      [
        { completedAt: new Date("2026-09-21T10:00:00Z") },
        { completedAt: new Date("2026-09-21T11:00:00Z") },
        { completedAt: new Date("2026-09-22T10:00:00Z") },
      ],
      { current: 3, longest: 3 },
    );
    expect(result).toEqual({ bestWeekday: "Monday", streakBroken: false });
  });

  it("returns nulls when there are no completions and the streak is intact", () => {
    expect(pickHabitDetail([], { current: 2, longest: 2 })).toEqual({ bestWeekday: null, streakBroken: false });
  });
});

describe("pickCoachNoteTemplate", () => {
  it("returns null when no template is published for the category", async () => {
    mockGetPublishedCoachNoteTemplatesByCategory.mockResolvedValueOnce([]);
    expect(await pickCoachNoteTemplate("strength")).toBeNull();
  });

  it("returns the single published template when only one exists", async () => {
    const template = { id: "t1", category: "gap", template: { en: "x", hi: "x", hx: "x" } };
    mockGetPublishedCoachNoteTemplatesByCategory.mockResolvedValueOnce([template]);
    expect(await pickCoachNoteTemplate("gap")).toEqual(template);
  });

  it("picks one of several published templates", async () => {
    const templates = [
      { id: "t1", category: "habit", template: { en: "a", hi: "a", hx: "a" } },
      { id: "t2", category: "habit", template: { en: "b", hi: "b", hx: "b" } },
    ];
    mockGetPublishedCoachNoteTemplatesByCategory.mockResolvedValueOnce(templates);
    const picked = await pickCoachNoteTemplate("habit");
    expect(templates).toContainEqual(picked);
  });
});
