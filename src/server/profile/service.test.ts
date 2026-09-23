import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLevelInfo = vi.fn();
vi.mock("@/server/leveling/service", () => ({
  getLevelInfo: (userId: unknown) => mockGetLevelInfo(userId),
}));

const mockGetRankTitleForLevel = vi.fn();
vi.mock("@/server/rank-titles/service", () => ({
  getRankTitleForLevel: (level: unknown) => mockGetRankTitleForLevel(level),
}));

import { getProfileOverview } from "./service";

const USER: Parameters<typeof getProfileOverview>[0] = {
  id: "user_1",
  firstName: "Aarav",
  lastInitial: "S",
  createdAt: new Date("2026-01-05T09:12:00.000Z"),
} as Parameters<typeof getProfileOverview>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getProfileOverview", () => {
  it("a zero-activity user shows level 1, 0 XP and no rank title if none qualifies yet", async () => {
    mockGetLevelInfo.mockResolvedValueOnce({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
    });
    mockGetRankTitleForLevel.mockResolvedValueOnce(null);

    const overview = await getProfileOverview(USER);

    expect(overview).toEqual({
      firstName: "Aarav",
      lastInitial: "S",
      joinedAt: USER.createdAt,
      level: 1,
      totalXp: 0,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
      rankTitle: null,
    });
    expect(mockGetRankTitleForLevel).toHaveBeenCalledWith(1);
  });

  it("includes the rank title's localized text when one qualifies", async () => {
    mockGetLevelInfo.mockResolvedValueOnce({
      level: 5,
      totalXp: 1500,
      currentLevelStartXp: 1200,
      nextLevelStartXp: 1800,
      xpIntoLevel: 300,
      xpToNextLevel: 300,
    });
    mockGetRankTitleForLevel.mockResolvedValueOnce({
      id: "rt_1",
      minLevel: 5,
      title: { en: "Sprout", hi: "x", hx: "x" },
    });

    const overview = await getProfileOverview(USER);

    expect(overview.rankTitle).toEqual({ en: "Sprout", hi: "x", hx: "x" });
    expect(mockGetRankTitleForLevel).toHaveBeenCalledWith(5);
  });

  it("never exposes a full last name, only firstName + lastInitial (kid-safe)", async () => {
    mockGetLevelInfo.mockResolvedValueOnce({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
    });
    mockGetRankTitleForLevel.mockResolvedValueOnce(null);

    const overview = await getProfileOverview(USER);

    expect(overview).not.toHaveProperty("lastName");
    expect(overview).not.toHaveProperty("email");
    expect(overview).not.toHaveProperty("phone");
  });
});
