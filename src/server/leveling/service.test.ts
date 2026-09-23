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

const mockSumXpTotal = vi.fn();
const mockSumXpSince = vi.fn();
vi.mock("@/server/economy/repo", () => ({
  sumXpTotal: (userId: unknown) => mockSumXpTotal(userId),
  sumXpSince: (userId: unknown, since: unknown) => mockSumXpSince(userId, since),
}));

import { getLevelCurveSettings, getLevelInfo, getXpStats, updateLevelCurveSettings } from "./service";
import { DEFAULT_LEVEL_CURVE_SETTINGS, LEVEL_CURVE_SETTINGS_KEY } from "./schemas";

const ACTOR = { id: "staff_1" };
const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLevelCurveSettings", () => {
  it("falls back to defaults when nothing is seeded yet", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);

    expect(await getLevelCurveSettings()).toEqual(DEFAULT_LEVEL_CURVE_SETTINGS);
  });

  it("falls back to defaults when the stored value no longer matches the shape", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ garbage: true });

    expect(await getLevelCurveSettings()).toEqual(DEFAULT_LEVEL_CURVE_SETTINGS);
  });

  it("returns the stored value when valid", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ baseXp: 500, stepXp: 50 });

    expect(await getLevelCurveSettings()).toEqual({ baseXp: 500, stepXp: 50 });
  });
});

describe("updateLevelCurveSettings", () => {
  it("writes the new value and logs before/after", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_LEVEL_CURVE_SETTINGS);

    const result = await updateLevelCurveSettings(ACTOR, { baseXp: 500, stepXp: 50 }, META);

    expect(result).toEqual({ baseXp: 500, stepXp: 50 });
    expect(mockSetSettingJson).toHaveBeenCalledWith(
      LEVEL_CURVE_SETTINGS_KEY,
      { baseXp: 500, stepXp: 50 },
      expect.any(String),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "staff",
        action: "leveling.settings_updated",
        metadata: { previous: DEFAULT_LEVEL_CURVE_SETTINGS, next: { baseXp: 500, stepXp: 50 } },
      }),
    );
  });
});

describe("getLevelInfo", () => {
  it("a zero-activity user is level 1 with balance 0", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);
    mockSumXpTotal.mockResolvedValueOnce(0);

    const info = await getLevelInfo(USER.id);

    expect(info.level).toBe(1);
    expect(info.totalXp).toBe(0);
    expect(info.xpToNextLevel).toBe(300);
  });

  it("combines the settings and the summed XP total via the shared math", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ baseXp: 300, stepXp: 100 });
    mockSumXpTotal.mockResolvedValueOnce(1000);

    const info = await getLevelInfo(USER.id);

    expect(info.level).toBe(3);
    expect(info.totalXp).toBe(1000);
  });
});

describe("getXpStats", () => {
  const AT = new Date("2026-01-10T00:00:00.000Z");

  it("adds weeklyXp (summed over the trailing 7 days) on top of level info", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);
    mockSumXpTotal.mockResolvedValueOnce(0);
    mockSumXpSince.mockResolvedValueOnce(0);

    const stats = await getXpStats(USER.id, AT);

    expect(stats).toEqual({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
      weeklyXp: 0,
    });
  });

  it("passes a since-date exactly 7 days before `at`", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);
    mockSumXpTotal.mockResolvedValueOnce(0);
    mockSumXpSince.mockResolvedValueOnce(180);

    const stats = await getXpStats(USER.id, AT);

    expect(stats.weeklyXp).toBe(180);
    expect(mockSumXpSince).toHaveBeenCalledWith(USER.id, new Date("2026-01-03T00:00:00.000Z"));
  });
});
