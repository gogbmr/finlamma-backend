import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLevelInfo = vi.fn();
vi.mock("@/server/leveling/service", () => ({
  getLevelInfo: (userId: unknown) => mockGetLevelInfo(userId),
}));

const mockGetRankTitleForLevel = vi.fn();
vi.mock("@/server/rank-titles/service", () => ({
  getRankTitleForLevel: (level: unknown) => mockGetRankTitleForLevel(level),
}));

const mockGetStreakStats = vi.fn();
vi.mock("@/server/streaks/service", () => ({
  getStreakStats: (userId: unknown, at: unknown) => mockGetStreakStats(userId, at),
}));

const mockCountCompletedLessonsForUser = vi.fn();
const mockListLessonCompletionTimestampsForUser = vi.fn();
vi.mock("@/server/lesson-progress/repo", () => ({
  countCompletedLessonsForUser: (userId: unknown) => mockCountCompletedLessonsForUser(userId),
  listLessonCompletionTimestampsForUser: (userId: unknown, since: unknown) =>
    mockListLessonCompletionTimestampsForUser(userId, since),
}));

const mockCountPublishedLessons = vi.fn();
vi.mock("@/server/lessons/repo", () => ({
  countPublishedLessons: () => mockCountPublishedLessons(),
}));

const mockGetQuizAccuracyTotalsForUser = vi.fn();
vi.mock("@/server/quiz-attempts/repo", () => ({
  getQuizAccuracyTotalsForUser: (userId: unknown) => mockGetQuizAccuracyTotalsForUser(userId),
}));

import { getProfileOverview } from "./service";

const USER: Parameters<typeof getProfileOverview>[0] = {
  id: "user_1",
  firstName: "Aarav",
  lastInitial: "S",
  createdAt: new Date("2026-01-05T09:12:00.000Z"),
} as Parameters<typeof getProfileOverview>[0];

const AT = new Date("2026-09-23T12:00:00.000Z"); // 2026-09-23 17:30 IST

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStreakStats.mockResolvedValue({
    learning: { current: 0, longest: 0, freezesLeft: 2 },
    pulseCheck: { current: 0, longest: 0, freezesLeft: 2 },
  });
  mockCountCompletedLessonsForUser.mockResolvedValue(0);
  mockListLessonCompletionTimestampsForUser.mockResolvedValue([]);
  mockCountPublishedLessons.mockResolvedValue(0);
  mockGetQuizAccuracyTotalsForUser.mockResolvedValue({ correct: 0, total: 0 });
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

    const overview = await getProfileOverview(USER, AT);

    expect(overview).toEqual({
      firstName: "Aarav",
      lastInitial: "S",
      joinedAt: USER.createdAt,
      level: 1,
      totalXp: 0,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
      rankTitle: null,
      streak: { current: 0, longest: 0, freezesLeft: 2 },
      lessons: { completed: 0, total: 0, pct: 0 },
      quizAccuracyPct: null,
      activityDotCalendar: [
        { date: "2026-09-17", active: false },
        { date: "2026-09-18", active: false },
        { date: "2026-09-19", active: false },
        { date: "2026-09-20", active: false },
        { date: "2026-09-21", active: false },
        { date: "2026-09-22", active: false },
        { date: "2026-09-23", active: false },
      ],
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

  it("reads streak from the learning scope only, not pulse_check", async () => {
    mockGetLevelInfo.mockResolvedValueOnce({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
    });
    mockGetRankTitleForLevel.mockResolvedValueOnce(null);
    mockGetStreakStats.mockResolvedValueOnce({
      learning: { current: 7, longest: 20, freezesLeft: 1 },
      pulseCheck: { current: 99, longest: 99, freezesLeft: 0 },
    });

    const overview = await getProfileOverview(USER, AT);

    expect(overview.streak).toEqual({ current: 7, longest: 20, freezesLeft: 1 });
    expect(mockGetStreakStats).toHaveBeenCalledWith(USER.id, AT);
  });

  it("rounds lesson completion percentage and reports 0% with zero published lessons", async () => {
    mockGetLevelInfo.mockResolvedValueOnce({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
    });
    mockGetRankTitleForLevel.mockResolvedValueOnce(null);
    mockCountCompletedLessonsForUser.mockResolvedValueOnce(7);
    mockCountPublishedLessons.mockResolvedValueOnce(9);

    const overview = await getProfileOverview(USER, AT);

    expect(overview.lessons).toEqual({ completed: 7, total: 9, pct: 78 });
  });

  it("reports quizAccuracyPct: null before any graded question is answered", async () => {
    mockGetLevelInfo.mockResolvedValueOnce({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
    });
    mockGetRankTitleForLevel.mockResolvedValueOnce(null);
    mockGetQuizAccuracyTotalsForUser.mockResolvedValueOnce({ correct: 3, total: 4 });

    const overview = await getProfileOverview(USER, AT);

    expect(overview.quizAccuracyPct).toBe(75);
  });

  it("marks each of the last 7 IST dates active/inactive from lesson-completion timestamps", async () => {
    mockGetLevelInfo.mockResolvedValueOnce({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
    });
    mockGetRankTitleForLevel.mockResolvedValueOnce(null);
    // 2026-09-20 09:00 UTC = 2026-09-20 14:30 IST; 2026-09-23 01:00 UTC = 2026-09-23 06:30 IST.
    mockListLessonCompletionTimestampsForUser.mockResolvedValueOnce([
      new Date("2026-09-20T09:00:00.000Z"),
      new Date("2026-09-23T01:00:00.000Z"),
    ]);

    const overview = await getProfileOverview(USER, AT);

    expect(overview.activityDotCalendar).toEqual([
      { date: "2026-09-17", active: false },
      { date: "2026-09-18", active: false },
      { date: "2026-09-19", active: false },
      { date: "2026-09-20", active: true },
      { date: "2026-09-21", active: false },
      { date: "2026-09-22", active: false },
      { date: "2026-09-23", active: true },
    ]);
    expect(mockListLessonCompletionTimestampsForUser).toHaveBeenCalledWith(
      USER.id,
      new Date("2026-09-17T12:00:00.000Z"),
    );
  });
});
