import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSettingJson = vi.fn();
const mockSetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingJson: (key: unknown) => mockGetSettingJson(key),
  setSettingJson: (key: unknown, value: unknown, description: unknown) =>
    mockSetSettingJson(key, value, description),
}));

const mockStudyMinutes = vi.fn();
const mockLessonCompleted = vi.fn();
const mockPulseCheck = vi.fn();
vi.mock("./evaluators", () => ({
  DAILY_GOAL_EVALUATORS: {
    study_minutes: (userId: unknown, at: unknown) => mockStudyMinutes(userId, at),
    lesson_completed: (userId: unknown, at: unknown) => mockLessonCompleted(userId, at),
    pulse_check: (userId: unknown, at: unknown) => mockPulseCheck(userId, at),
  },
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import {
  getDailyGoalsSettings,
  getMyDailyGoals,
  updateDailyGoalsSettings,
} from "./service";
import { DEFAULT_DAILY_GOALS } from "./schemas";

const USER_ID = "user_1";
const ACTOR = { id: "staff_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const AT = new Date("2026-09-24T10:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDailyGoalsSettings", () => {
  it("falls back to the default when nothing is seeded", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);

    expect(await getDailyGoalsSettings()).toEqual(DEFAULT_DAILY_GOALS);
  });

  it("falls back to the default when the stored shape no longer parses", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ not: "an array" });

    expect(await getDailyGoalsSettings()).toEqual(DEFAULT_DAILY_GOALS);
  });

  it("returns the stored settings when valid", async () => {
    const stored = [{ type: "study_minutes" as const, target: 45, active: true }];
    mockGetSettingJson.mockResolvedValueOnce(stored);

    expect(await getDailyGoalsSettings()).toEqual(stored);
  });
});

describe("updateDailyGoalsSettings", () => {
  it("persists and logs the change with before/after values", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_DAILY_GOALS);
    const next = [{ type: "study_minutes" as const, target: 45, active: true }];

    const result = await updateDailyGoalsSettings(ACTOR, next, META);

    expect(mockSetSettingJson).toHaveBeenCalledWith("daily_goals", next, expect.any(String));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.daily_goals_updated",
        metadata: { previous: DEFAULT_DAILY_GOALS, next },
      }),
    );
    expect(result).toEqual(next);
  });
});

describe("getMyDailyGoals", () => {
  it("returns only active goals, each with today's real progress", async () => {
    mockGetSettingJson.mockResolvedValueOnce([
      { type: "study_minutes", target: 20, active: true },
      { type: "lesson_completed", target: 1, active: true },
      { type: "pulse_check", target: 1, active: false },
    ]);
    mockStudyMinutes.mockResolvedValueOnce(12);
    mockLessonCompleted.mockResolvedValueOnce(1);

    const result = await getMyDailyGoals(USER_ID, AT);

    expect(result).toEqual([
      { type: "study_minutes", target: 20, current: 12, completed: false },
      { type: "lesson_completed", target: 1, current: 1, completed: true },
    ]);
    expect(mockPulseCheck).not.toHaveBeenCalled();
  });

  it("returns an empty list if every goal is currently inactive", async () => {
    mockGetSettingJson.mockResolvedValueOnce([
      { type: "study_minutes", target: 20, active: false },
    ]);

    expect(await getMyDailyGoals(USER_ID, AT)).toEqual([]);
    expect(mockStudyMinutes).not.toHaveBeenCalled();
  });

  it("marks a goal completed once current reaches (not just exceeds) target", async () => {
    mockGetSettingJson.mockResolvedValueOnce([
      { type: "study_minutes", target: 20, active: true },
    ]);
    mockStudyMinutes.mockResolvedValueOnce(20);

    const [goal] = await getMyDailyGoals(USER_ID, AT);

    expect(goal.completed).toBe(true);
  });
});
