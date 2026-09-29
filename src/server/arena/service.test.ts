import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentWorldIdForUser = vi.fn();
const mockWeeklyXpByScope = vi.fn();
const mockGetDisplayNamesForUserIds = vi.fn();
const mockXpByWorldInRange = vi.fn();
const mockListPublishedWorldsOrdered = vi.fn();
const mockGetWorldXpSparklines = vi.fn();
const mockListRecentXpEvents = vi.fn();
const mockFindCheerableUser = vi.fn();
const mockInsertCheerIfNew = vi.fn();
const mockSumCheerXpCreditedToday = vi.fn();
const mockCountCheersReceivedSince = vi.fn();
const mockListAboutMeChips = vi.fn();
const mockListActiveAboutMeChips = vi.fn();
const mockGetAboutMeChipById = vi.fn();
const mockInsertAboutMeChip = vi.fn();
const mockUpdateAboutMeChipRow = vi.fn();
const mockDeleteAboutMeChipRow = vi.fn();
const mockGetSelectedChipsForUser = vi.fn();
const mockReplaceUserChipSelection = vi.fn();
const mockGetWorldTitleById = vi.fn();
const mockCountPublishedLessonsInWorld = vi.fn();
const mockCountCompletedLessonsForUserInWorld = vi.fn();
vi.mock("./repo", () => ({
  getCurrentWorldIdForUser: (userId: unknown) => mockGetCurrentWorldIdForUser(userId),
  weeklyXpByScope: (scope: unknown, since: unknown) => mockWeeklyXpByScope(scope, since),
  getDisplayNamesForUserIds: (ids: unknown) => mockGetDisplayNamesForUserIds(ids),
  xpByWorldInRange: (since: unknown, before: unknown) => mockXpByWorldInRange(since, before),
  listPublishedWorldsOrdered: () => mockListPublishedWorldsOrdered(),
  getWorldXpSparklines: (ids: unknown, days: unknown) => mockGetWorldXpSparklines(ids, days),
  listRecentXpEvents: (limit: unknown) => mockListRecentXpEvents(limit),
  findCheerableUser: (id: unknown) => mockFindCheerableUser(id),
  insertCheerIfNew: (s: unknown, r: unknown, d: unknown) => mockInsertCheerIfNew(s, r, d),
  sumCheerXpCreditedToday: (r: unknown, d: unknown) => mockSumCheerXpCreditedToday(r, d),
  countCheersReceivedSince: (r: unknown, s: unknown) => mockCountCheersReceivedSince(r, s),
  listAboutMeChips: () => mockListAboutMeChips(),
  listActiveAboutMeChips: () => mockListActiveAboutMeChips(),
  getAboutMeChipById: (id: unknown) => mockGetAboutMeChipById(id),
  insertAboutMeChip: (input: unknown) => mockInsertAboutMeChip(input),
  updateAboutMeChipRow: (id: unknown, input: unknown) => mockUpdateAboutMeChipRow(id, input),
  deleteAboutMeChipRow: (id: unknown) => mockDeleteAboutMeChipRow(id),
  getSelectedChipsForUser: (id: unknown) => mockGetSelectedChipsForUser(id),
  replaceUserChipSelection: (id: unknown, chipIds: unknown) => mockReplaceUserChipSelection(id, chipIds),
  getWorldTitleById: (id: unknown) => mockGetWorldTitleById(id),
  countPublishedLessonsInWorld: (id: unknown) => mockCountPublishedLessonsInWorld(id),
  countCompletedLessonsForUserInWorld: (u: unknown, w: unknown) => mockCountCompletedLessonsForUserInWorld(u, w),
}));

const mockCreditXpRow = vi.fn();
const mockSumXpSince = vi.fn();
vi.mock("@/server/economy/repo", () => ({
  creditXpRow: (input: unknown) => mockCreditXpRow(input),
  sumXpSince: (userId: unknown, since: unknown) => mockSumXpSince(userId, since),
}));

const mockGetLevelInfo = vi.fn();
vi.mock("@/server/leveling/service", () => ({ getLevelInfo: (id: unknown) => mockGetLevelInfo(id) }));

const mockGetQuizAccuracyTotalsForUser = vi.fn();
vi.mock("@/server/quiz-attempts/repo", () => ({
  getQuizAccuracyTotalsForUser: (id: unknown) => mockGetQuizAccuracyTotalsForUser(id),
}));

const mockGetRankTitleForLevel = vi.fn();
vi.mock("@/server/rank-titles/service", () => ({
  getRankTitleForLevel: (level: unknown) => mockGetRankTitleForLevel(level),
}));

const mockGetStreakStats = vi.fn();
vi.mock("@/server/streaks/service", () => ({ getStreakStats: (id: unknown) => mockGetStreakStats(id) }));

const mockGetMyBadges = vi.fn();
vi.mock("@/server/badges/service", () => ({ getMyBadges: (id: unknown) => mockGetMyBadges(id) }));

const mockIsUniqueViolation = vi.fn();
vi.mock("@/lib/db-errors", () => ({ isUniqueViolation: (err: unknown) => mockIsUniqueViolation(err) }));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockGetSettingNumber = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingNumber: (key: unknown, fallback: unknown) => mockGetSettingNumber(key, fallback),
}));

import {
  createAboutMeChipForAdmin,
  deleteAboutMeChipForAdmin,
  getActivityFeed,
  getLeaderboard,
  getMyCheersSummary,
  getMySelectedChips,
  getPublicProfile,
  getWorldLeaderboard,
  getWorldsLeaderboard,
  listAboutMeChipsForAdmin,
  sendCheer,
  setMySelectedChips,
  updateAboutMeChipForAdmin,
} from "./service";

const META = { ip: null, userAgent: null };

function names(ids: string[]) {
  return new Map(ids.map((id) => [id, { firstName: `First-${id}`, lastInitial: "L" }]));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSettingNumber.mockResolvedValue(20);
  mockGetDisplayNamesForUserIds.mockImplementation((ids: string[]) => Promise.resolve(names(ids)));
});

describe("getLeaderboard", () => {
  it("ranks a global leaderboard by weekly XP, descending", async () => {
    mockWeeklyXpByScope.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, i) => ({ userId: `u${i}`, xp: i })),
    );

    const result = await getLeaderboard({ id: "u24", state: null }, "global");

    expect(result.scope).toBe("global");
    expect(result.fallbackApplied).toBe(false);
    expect(result.notEnoughPlayers).toBe(false);
    expect(result.rows[0]).toMatchObject({ rank: 1, userId: "u24", xp: 24, isSelf: true });
    expect(result.rows).toHaveLength(25);
  });

  it("caps returned rows at the top 50 but still surfaces the caller's own rank outside that window", async () => {
    mockWeeklyXpByScope.mockResolvedValueOnce(
      Array.from({ length: 60 }, (_, i) => ({ userId: `u${i}`, xp: 60 - i })),
    );

    const result = await getLeaderboard({ id: "u59", state: null }, "global");

    expect(result.rows).toHaveLength(51); // top 50 + self appended
    expect(result.self).toEqual({ rank: 60, xp: 1 });
    expect(result.rows.at(-1)).toMatchObject({ userId: "u59", isSelf: true, rank: 60 });
  });

  it("falls back a thin state pool to india and reports fallbackApplied", async () => {
    mockWeeklyXpByScope
      .mockResolvedValueOnce([{ userId: "u1", xp: 10 }]) // requested state pool: thin
      .mockResolvedValueOnce(
        Array.from({ length: 30 }, (_, i) => ({ userId: `u${i}`, xp: i })),
      ); // india pool: meets floor

    const result = await getLeaderboard({ id: "u1", state: "Sikkim" }, "state");

    expect(result.requestedScope).toBe("state:Sikkim");
    expect(result.scope).toBe("india");
    expect(result.fallbackApplied).toBe(true);
    expect(result.notEnoughPlayers).toBe(false);
  });

  it("marks notEnoughPlayers when even the india fallback is thin (very early launch)", async () => {
    mockWeeklyXpByScope
      .mockResolvedValueOnce([{ userId: "u1", xp: 10 }])
      .mockResolvedValueOnce([{ userId: "u1", xp: 10 }, { userId: "u2", xp: 5 }]);

    const result = await getLeaderboard({ id: "u1", state: "Sikkim" }, "state");

    expect(result.scope).toBe("india");
    expect(result.notEnoughPlayers).toBe(true);
  });

  it("marks a thin world scope as notEnoughPlayers with no fallback", async () => {
    mockGetCurrentWorldIdForUser.mockResolvedValueOnce("world-1");
    mockWeeklyXpByScope.mockResolvedValueOnce([{ userId: "u1", xp: 10 }]);

    const result = await getLeaderboard({ id: "u1", state: null }, "world");

    expect(result.scope).toBe("world:world-1");
    expect(result.fallbackApplied).toBe(false);
    expect(result.notEnoughPlayers).toBe(true);
  });

  it("a state-scope request with no users.state on file goes straight to india", async () => {
    mockWeeklyXpByScope.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, i) => ({ userId: `u${i}`, xp: i })),
    );

    const result = await getLeaderboard({ id: "u0", state: null }, "state");

    expect(result.requestedScope).toBe("india");
    expect(result.scope).toBe("india");
    expect(mockWeeklyXpByScope).toHaveBeenCalledTimes(1);
  });

  it("returns self: null when the caller has no XP yet this week", async () => {
    mockWeeklyXpByScope.mockResolvedValueOnce([{ userId: "someone-else", xp: 5 }]);

    const result = await getLeaderboard({ id: "u1", state: null }, "global");

    expect(result.self).toBeNull();
  });
});

describe("getWorldLeaderboard", () => {
  it("ranks a specific world's own pool, not the caller's current world", async () => {
    mockWeeklyXpByScope.mockResolvedValueOnce([
      { userId: "u1", xp: 50 },
      { userId: "u2", xp: 10 },
    ]);

    const result = await getWorldLeaderboard({ id: "u2", state: null }, "world-9");

    expect(result.scope).toBe("world:world-9");
    expect(mockGetCurrentWorldIdForUser).not.toHaveBeenCalled();
    expect(result.self).toEqual({ rank: 2, xp: 10 });
  });

  it("reports notEnoughPlayers for a thin world with no fallback", async () => {
    mockWeeklyXpByScope.mockResolvedValueOnce([{ userId: "u1", xp: 5 }]);

    const result = await getWorldLeaderboard({ id: "u1", state: null }, "world-1");

    expect(result.notEnoughPlayers).toBe(true);
    expect(result.fallbackApplied).toBe(false);
  });
});

describe("getWorldsLeaderboard", () => {
  it("ranks worlds by weekly XP, computes xpPerMember and week-over-week deltaPct", async () => {
    mockXpByWorldInRange
      .mockResolvedValueOnce([
        { worldId: "w1", xp: 100, memberCount: 10 },
        { worldId: "w2", xp: 500, memberCount: 5 },
      ])
      .mockResolvedValueOnce([{ worldId: "w1", xp: 50, memberCount: 8 }]); // last week: w2 had 0
    mockListPublishedWorldsOrdered.mockResolvedValueOnce([
      { id: "w1", title: { en: "Money World", hi: "", hx: "" }, order: 1 },
      { id: "w2", title: { en: "Trade World", hi: "", hx: "" }, order: 2 },
    ]);
    mockGetWorldXpSparklines.mockResolvedValueOnce(new Map());

    const result = await getWorldsLeaderboard();

    expect(result.worlds).toHaveLength(2);
    expect(result.worlds[0]).toMatchObject({ worldId: "w2", xp: 500, memberCount: 5, xpPerMember: 100, deltaPct: null });
    expect(result.worlds[1]).toMatchObject({ worldId: "w1", xp: 100, memberCount: 10, xpPerMember: 10, deltaPct: 100 });
  });

  it("omits a world with no title (e.g. deleted/unpublished since) rather than crashing", async () => {
    mockXpByWorldInRange.mockResolvedValueOnce([{ worldId: "ghost", xp: 10, memberCount: 1 }]).mockResolvedValueOnce([]);
    mockListPublishedWorldsOrdered.mockResolvedValueOnce([]);
    mockGetWorldXpSparklines.mockResolvedValueOnce(new Map());

    const result = await getWorldsLeaderboard();

    expect(result.worlds).toHaveLength(0);
  });
});

describe("sendCheer", () => {
  it("rejects cheering yourself", async () => {
    await expect(sendCheer({ id: "u1" }, "u1", META)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockFindCheerableUser).not.toHaveBeenCalled();
  });

  it("rejects a receiver that doesn't exist or is deleted", async () => {
    mockFindCheerableUser.mockResolvedValueOnce(null);
    await expect(sendCheer({ id: "u1" }, "ghost", META)).rejects.toMatchObject({ code: "NOT_FOUND" });

    mockFindCheerableUser.mockResolvedValueOnce({ id: "u2", deletedAt: new Date(), preferences: {} });
    await expect(sendCheer({ id: "u1" }, "u2", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a receiver who opted out (explicit false only)", async () => {
    mockFindCheerableUser.mockResolvedValueOnce({ id: "u2", deletedAt: null, preferences: { cheersEnabled: false } });

    await expect(sendCheer({ id: "u1" }, "u2", META)).rejects.toMatchObject({
      code: "CHEER_RECEIVER_OPTED_OUT",
    });
    expect(mockInsertCheerIfNew).not.toHaveBeenCalled();
  });

  it("allows a receiver with cheersEnabled missing (predates the preference) - defaults to enabled", async () => {
    mockFindCheerableUser.mockResolvedValueOnce({ id: "u2", deletedAt: null, preferences: {} });
    mockInsertCheerIfNew.mockResolvedValueOnce({ id: "cheer-1" });
    mockGetSettingNumber.mockResolvedValueOnce(5).mockResolvedValueOnce(50);
    mockSumCheerXpCreditedToday.mockResolvedValueOnce(0);

    const result = await sendCheer({ id: "u1" }, "u2", META);

    expect(result).toEqual({ alreadyCheeredToday: false, xpAwarded: 5, dailyCapReached: false });
    expect(mockCreditXpRow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u2", amount: 5, sourceType: "cheer", sourceId: "cheer-1" }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "arena.cheer_sent", actorId: "u1", targetId: "u2" }),
    );
  });

  it("is a no-op (no additional credit) when already cheered today", async () => {
    mockFindCheerableUser.mockResolvedValueOnce({ id: "u2", deletedAt: null, preferences: { cheersEnabled: true } });
    mockInsertCheerIfNew.mockResolvedValueOnce(null); // conflict - already cheered today

    const result = await sendCheer({ id: "u1" }, "u2", META);

    expect(result).toEqual({ alreadyCheeredToday: true, xpAwarded: 0, dailyCapReached: false });
    expect(mockCreditXpRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("clamps the award to what remains of the receiver's daily cap", async () => {
    mockFindCheerableUser.mockResolvedValueOnce({ id: "u2", deletedAt: null, preferences: { cheersEnabled: true } });
    mockInsertCheerIfNew.mockResolvedValueOnce({ id: "cheer-2" });
    mockGetSettingNumber.mockResolvedValueOnce(5).mockResolvedValueOnce(50);
    mockSumCheerXpCreditedToday.mockResolvedValueOnce(48); // only 2 remain of the 50 cap

    const result = await sendCheer({ id: "u1" }, "u2", META);

    expect(result).toEqual({ alreadyCheeredToday: false, xpAwarded: 2, dailyCapReached: true });
    expect(mockCreditXpRow).toHaveBeenCalledWith(expect.objectContaining({ amount: 2 }));
  });

  it("credits zero (never negative) and skips the ledger write once the cap is fully used", async () => {
    mockFindCheerableUser.mockResolvedValueOnce({ id: "u2", deletedAt: null, preferences: { cheersEnabled: true } });
    mockInsertCheerIfNew.mockResolvedValueOnce({ id: "cheer-3" });
    mockGetSettingNumber.mockResolvedValueOnce(5).mockResolvedValueOnce(50);
    mockSumCheerXpCreditedToday.mockResolvedValueOnce(50);

    const result = await sendCheer({ id: "u1" }, "u2", META);

    expect(result).toEqual({ alreadyCheeredToday: false, xpAwarded: 0, dailyCapReached: true });
    expect(mockCreditXpRow).not.toHaveBeenCalled();
    // The cheer itself (and its idempotency record) still logs, even at 0 XP.
    expect(mockLogActivity).toHaveBeenCalled();
  });
});

describe("getMyCheersSummary", () => {
  it("returns only an aggregate count, never sender identity", async () => {
    mockCountCheersReceivedSince.mockResolvedValueOnce(12);

    const result = await getMyCheersSummary({ id: "u1" });

    expect(result).toEqual({ receivedThisWeek: 12 });
  });
});

describe("getActivityFeed", () => {
  it("shapes recent XP events into kid-safe activity items", async () => {
    const createdAt = new Date("2026-09-28T10:00:00.000Z");
    mockListRecentXpEvents.mockResolvedValueOnce([
      { userId: "u1", firstName: "Aarav", lastInitial: "S", amount: 80, createdAt },
    ]);

    const result = await getActivityFeed();

    expect(result.items).toEqual([
      { firstName: "Aarav", lastInitial: "S", amount: 80, createdAt: "2026-09-28T10:00:00.000Z" },
    ]);
  });
});

describe("about-me chips - admin", () => {
  it("lists, creates and updates a chip, logging every mutation", async () => {
    mockListAboutMeChips.mockResolvedValueOnce([{ id: "c1" }]);
    expect(await listAboutMeChipsForAdmin()).toEqual([{ id: "c1" }]);

    const input = { name: { en: "Saver", hi: "x", hx: "x" }, iconKey: "piggy-bank", active: true };
    mockInsertAboutMeChip.mockResolvedValueOnce({ id: "c2", ...input });
    const created = await createAboutMeChipForAdmin({ id: "staff1" }, input, META);
    expect(created).toEqual({ id: "c2", ...input });
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "about_me_chips.created" }));

    mockGetAboutMeChipById.mockResolvedValueOnce({ id: "c2", name: input.name, active: true });
    mockUpdateAboutMeChipRow.mockResolvedValueOnce({ id: "c2", ...input, active: false });
    const updated = await updateAboutMeChipForAdmin({ id: "staff1" }, "c2", { ...input, active: false }, META);
    expect(updated.active).toBe(false);
  });

  it("rejects updating a chip that doesn't exist", async () => {
    mockGetAboutMeChipById.mockResolvedValueOnce(null);

    await expect(
      updateAboutMeChipForAdmin({ id: "staff1" }, "ghost", { name: { en: "x", hi: "x", hx: "x" }, active: true }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("turns a delete of an in-use chip into a clear CONFLICT, not a raw FK error", async () => {
    mockGetAboutMeChipById.mockResolvedValueOnce({ id: "c1", name: { en: "Saver", hi: "x", hx: "x" } });
    mockDeleteAboutMeChipRow.mockRejectedValueOnce(new Error("foreign key violation"));
    mockIsUniqueViolation.mockReturnValueOnce(false);

    await expect(deleteAboutMeChipForAdmin({ id: "staff1" }, "c1", META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects deleting a chip that doesn't exist", async () => {
    mockGetAboutMeChipById.mockResolvedValueOnce(null);

    await expect(deleteAboutMeChipForAdmin({ id: "staff1" }, "ghost", META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("about-me chips - learner selection", () => {
  it("returns the learner's currently selected chips", async () => {
    mockGetSelectedChipsForUser.mockResolvedValueOnce([{ id: "c1", name: { en: "Saver" }, iconKey: null }]);

    const result = await getMySelectedChips("u1");

    expect(result).toEqual([{ id: "c1", name: { en: "Saver" }, iconKey: null }]);
  });

  it("rejects more than the max allowed chips", async () => {
    await expect(setMySelectedChips({ id: "u1" }, ["c1", "c2", "c3", "c4"], META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockReplaceUserChipSelection).not.toHaveBeenCalled();
  });

  it("rejects a chip id that isn't currently active", async () => {
    mockListActiveAboutMeChips.mockResolvedValueOnce([{ id: "c1" }]);

    await expect(setMySelectedChips({ id: "u1" }, ["c1", "c2"], META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockReplaceUserChipSelection).not.toHaveBeenCalled();
  });

  it("de-duplicates and saves a valid selection, logging the change", async () => {
    mockListActiveAboutMeChips.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);

    await setMySelectedChips({ id: "u1" }, ["c1", "c1", "c2"], META);

    expect(mockReplaceUserChipSelection).toHaveBeenCalledWith("u1", ["c1", "c2"]);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "about_me_chips.selection_updated", actorId: "u1" }),
    );
  });
});

describe("getPublicProfile", () => {
  it("throws NOT_FOUND for a missing or deleted learner", async () => {
    mockFindCheerableUser.mockResolvedValueOnce(null);
    await expect(getPublicProfile("ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });

    mockFindCheerableUser.mockResolvedValueOnce({ id: "u2", deletedAt: new Date() });
    await expect(getPublicProfile("u2")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shapes the full allowlisted public profile, only unlocked badges, no private fields", async () => {
    mockFindCheerableUser.mockResolvedValueOnce({ id: "u2", deletedAt: null });
    mockGetDisplayNamesForUserIds.mockResolvedValueOnce(
      new Map([["u2", { firstName: "Meera", lastInitial: "K" }]]),
    );
    mockGetLevelInfo.mockResolvedValueOnce({ level: 4, totalXp: 1000 });
    mockGetStreakStats.mockResolvedValueOnce({ learning: { current: 4, longest: 12 }, pulseCheck: {} });
    mockGetQuizAccuracyTotalsForUser.mockResolvedValueOnce({ correct: 41, total: 50 });
    mockGetMyBadges.mockResolvedValueOnce([
      { id: "b1", name: { en: "First Trade" }, description: { en: "x" }, iconKey: "trophy", unlocked: true },
      { id: "b2", name: { en: "Locked" }, description: { en: "x" }, iconKey: null, unlocked: false },
    ]);
    mockGetSelectedChipsForUser.mockResolvedValueOnce([{ id: "c1", name: { en: "Saver" }, iconKey: null }]);
    mockGetCurrentWorldIdForUser.mockResolvedValueOnce("w1");
    mockSumXpSince.mockResolvedValueOnce(1240);
    mockGetRankTitleForLevel.mockResolvedValueOnce({ title: { en: "Investor" } });
    mockGetWorldTitleById.mockResolvedValueOnce({ en: "Money World" });
    mockCountCompletedLessonsForUserInWorld.mockResolvedValueOnce(6);
    mockCountPublishedLessonsInWorld.mockResolvedValueOnce(40);

    const result = await getPublicProfile("u2");

    expect(result).toEqual({
      firstName: "Meera",
      lastInitial: "K",
      level: 4,
      rankTitle: { en: "Investor" },
      badges: [{ id: "b1", name: { en: "First Trade" }, description: { en: "x" }, iconKey: "trophy" }],
      chips: [{ id: "c1", name: { en: "Saver" }, iconKey: null }],
      weekXp: 1240,
      streak: { current: 4, longest: 12 },
      quizAccuracyPct: 82,
      currentWorld: { id: "w1", title: { en: "Money World" }, completedLessons: 6, totalLessons: 40 },
    });
    // Never in the output at all - not just falsy:
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("state");
    expect(result).not.toHaveProperty("bio");
    expect(result).not.toHaveProperty("dateOfBirth");
  });

  it("returns currentWorld: null when the learner has no world yet (no published catalog)", async () => {
    mockFindCheerableUser.mockResolvedValueOnce({ id: "u2", deletedAt: null });
    mockGetDisplayNamesForUserIds.mockResolvedValueOnce(new Map());
    mockGetLevelInfo.mockResolvedValueOnce({ level: 1, totalXp: 0 });
    mockGetStreakStats.mockResolvedValueOnce({ learning: { current: 0, longest: 0 }, pulseCheck: {} });
    mockGetQuizAccuracyTotalsForUser.mockResolvedValueOnce({ correct: 0, total: 0 });
    mockGetMyBadges.mockResolvedValueOnce([]);
    mockGetSelectedChipsForUser.mockResolvedValueOnce([]);
    mockGetCurrentWorldIdForUser.mockResolvedValueOnce(null);
    mockSumXpSince.mockResolvedValueOnce(0);
    mockGetRankTitleForLevel.mockResolvedValueOnce(null);

    const result = await getPublicProfile("u2");

    expect(result.currentWorld).toBeNull();
    expect(result.quizAccuracyPct).toBeNull();
    expect(mockGetWorldTitleById).not.toHaveBeenCalled();
  });
});
