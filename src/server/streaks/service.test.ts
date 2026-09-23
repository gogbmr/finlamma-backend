import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSettingJson = vi.fn();
const mockSetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingJson: (key: unknown) => mockGetSettingJson(key),
  setSettingJson: (key: unknown, value: unknown, description?: unknown) =>
    mockSetSettingJson(key, value, description),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockGetStreak = vi.fn();
const mockRecordStreakActivity = vi.fn();
vi.mock("./repo", () => ({
  getStreak: (userId: unknown, scope: unknown) => mockGetStreak(userId, scope),
  recordStreakActivity: (userId: unknown, scope: unknown, todayIst: unknown, freezes: unknown) =>
    mockRecordStreakActivity(userId, scope, todayIst, freezes),
}));

import {
  getStreaksSettings,
  getStreakStats,
  recordLearningActivity,
  updateStreaksSettings,
} from "./service";
import { DEFAULT_STREAKS_SETTINGS, STREAKS_SETTINGS_KEY } from "./schemas";

const ACTOR = { id: "staff_1" };
const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getStreaksSettings", () => {
  it("falls back to defaults when nothing is seeded yet", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);

    expect(await getStreaksSettings()).toEqual(DEFAULT_STREAKS_SETTINGS);
  });

  it("falls back to defaults when the stored value no longer matches the shape", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ garbage: true });

    expect(await getStreaksSettings()).toEqual(DEFAULT_STREAKS_SETTINGS);
  });

  it("returns the stored value when valid", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 5 });

    expect(await getStreaksSettings()).toEqual({ streakFreezesPerMonth: 5 });
  });
});

describe("updateStreaksSettings", () => {
  it("writes the new value and logs before/after", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_STREAKS_SETTINGS);

    const result = await updateStreaksSettings(ACTOR, { streakFreezesPerMonth: 3 }, META);

    expect(result).toEqual({ streakFreezesPerMonth: 3 });
    expect(mockSetSettingJson).toHaveBeenCalledWith(
      STREAKS_SETTINGS_KEY,
      { streakFreezesPerMonth: 3 },
      expect.any(String),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "staff",
        action: "streaks.settings_updated",
        metadata: { previous: DEFAULT_STREAKS_SETTINGS, next: { streakFreezesPerMonth: 3 } },
      }),
    );
  });
});

describe("recordLearningActivity", () => {
  it("computes today's IST date server-side and passes the configured freeze allowance", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockRecordStreakActivity.mockResolvedValueOnce({ current: 1, extended: true });

    // 2026-01-01T18:31:00Z is 2026-01-02 00:01 IST.
    await recordLearningActivity(USER.id, new Date("2026-01-01T18:31:00.000Z"));

    expect(mockRecordStreakActivity).toHaveBeenCalledWith(USER.id, "learning", "2026-01-02", 2);
  });
});

describe("getStreakStats", () => {
  it("defaults an untouched scope to 0/0/full freezes rather than requiring a row to exist", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockGetStreak.mockResolvedValueOnce(null); // learning
    mockGetStreak.mockResolvedValueOnce(null); // pulse_check

    const result = await getStreakStats(USER.id);

    expect(result).toEqual({
      learning: { current: 0, longest: 0, freezesLeft: 2 },
      pulseCheck: { current: 0, longest: 0, freezesLeft: 2 },
    });
  });

  it("shapes an existing row's real values", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockGetStreak.mockResolvedValueOnce({ current: 5, longest: 12, freezesLeft: 1 }); // learning
    mockGetStreak.mockResolvedValueOnce(null); // pulse_check

    const result = await getStreakStats(USER.id);

    expect(result.learning).toEqual({ current: 5, longest: 12, freezesLeft: 1 });
    expect(result.pulseCheck).toEqual({ current: 0, longest: 0, freezesLeft: 2 });
  });
});
