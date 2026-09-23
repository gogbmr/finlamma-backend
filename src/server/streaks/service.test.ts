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
  const TODAY = new Date("2026-01-10T04:00:00.000Z"); // 2026-01-10 09:30 IST

  it("defaults an untouched scope to 0/0/full freezes rather than requiring a row to exist", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockGetStreak.mockResolvedValueOnce(null); // learning
    mockGetStreak.mockResolvedValueOnce(null); // pulse_check

    const result = await getStreakStats(USER.id, TODAY);

    expect(result).toEqual({
      learning: { current: 0, longest: 0, freezesLeft: 2 },
      pulseCheck: { current: 0, longest: 0, freezesLeft: 2 },
    });
  });

  it("shapes an existing row's real values when it's still current (active today)", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockGetStreak.mockResolvedValueOnce({
      current: 5,
      longest: 12,
      freezesLeft: 1,
      lastActiveDateIst: "2026-01-10",
      freezesResetMonth: "2026-01",
    }); // learning
    mockGetStreak.mockResolvedValueOnce(null); // pulse_check

    const result = await getStreakStats(USER.id, TODAY);

    expect(result.learning).toEqual({ current: 5, longest: 12, freezesLeft: 1 });
    expect(result.pulseCheck).toEqual({ current: 0, longest: 0, freezesLeft: 2 });
  });

  it("still shows the streak as current the day after last activity, even though nothing has run since", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockGetStreak.mockResolvedValueOnce({
      current: 5,
      longest: 12,
      freezesLeft: 2,
      lastActiveDateIst: "2026-01-09", // yesterday - gap of 1, still within the window to extend today
      freezesResetMonth: "2026-01",
    });
    mockGetStreak.mockResolvedValueOnce(null);

    const result = await getStreakStats(USER.id, TODAY);

    expect(result.learning).toEqual({ current: 5, longest: 12, freezesLeft: 2 });
  });

  it("still shows the streak as current when exactly one day was missed and a freeze is available to cover it", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockGetStreak.mockResolvedValueOnce({
      current: 5,
      longest: 12,
      freezesLeft: 2,
      lastActiveDateIst: "2026-01-08", // gap of 2 - one day (Jan 9) missed
      freezesResetMonth: "2026-01",
    });
    mockGetStreak.mockResolvedValueOnce(null);

    const result = await getStreakStats(USER.id, TODAY);

    // Freeze is NOT actually consumed by a read - only a real activity
    // (recordStreakActivity) consumes it. The read just reports "still alive".
    expect(result.learning).toEqual({ current: 5, longest: 12, freezesLeft: 2 });
  });

  it("shows the streak as broken (0) once a single missed day can no longer be covered - no freezes left", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockGetStreak.mockResolvedValueOnce({
      current: 5,
      longest: 12,
      freezesLeft: 0,
      lastActiveDateIst: "2026-01-08", // gap of 2, no freeze available to cover it
      freezesResetMonth: "2026-01",
    });
    mockGetStreak.mockResolvedValueOnce(null);

    const result = await getStreakStats(USER.id, TODAY);

    expect(result.learning).toEqual({ current: 0, longest: 12, freezesLeft: 0 });
  });

  it("shows the streak as broken (0) after a 10-day gap, regardless of freezes remaining - no retroactive freeze stacking", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockGetStreak.mockResolvedValueOnce({
      current: 5,
      longest: 12,
      freezesLeft: 2, // both freezes still available and untouched
      lastActiveDateIst: "2025-12-31", // 10 days before TODAY (2026-01-10)
      freezesResetMonth: "2025-12",
    });
    mockGetStreak.mockResolvedValueOnce(null);

    const result = await getStreakStats(USER.id, TODAY);

    // Broken, and the freezes are reported untouched - a long gap never
    // consumes them, it just breaks the streak.
    expect(result.learning).toEqual({ current: 0, longest: 12, freezesLeft: 2 });
  });

  it("applies the lazy monthly freeze reset when computing whether a gap is still coverable", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ streakFreezesPerMonth: 2 });
    mockGetStreak.mockResolvedValueOnce({
      current: 5,
      longest: 12,
      freezesLeft: 0, // exhausted in December
      lastActiveDateIst: "2026-01-08", // gap of 2 from TODAY (2026-01-10)
      freezesResetMonth: "2025-12", // stale - a new IST month has started
    });
    mockGetStreak.mockResolvedValueOnce(null);

    const result = await getStreakStats(USER.id, TODAY);

    // The allowance is treated as freshly reset for January, so the one
    // missed day is still coverable and the streak still reads as current.
    expect(result.learning).toEqual({ current: 5, longest: 12, freezesLeft: 2 });
  });
});
