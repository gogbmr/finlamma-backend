import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCurrentWorldIdForUser = vi.fn();
const mockWeeklyXpByScope = vi.fn();
const mockGetDisplayNamesForUserIds = vi.fn();
vi.mock("./repo", () => ({
  getCurrentWorldIdForUser: (userId: unknown) => mockGetCurrentWorldIdForUser(userId),
  weeklyXpByScope: (scope: unknown, since: unknown) => mockWeeklyXpByScope(scope, since),
  getDisplayNamesForUserIds: (ids: unknown) => mockGetDisplayNamesForUserIds(ids),
}));

const mockGetSettingNumber = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingNumber: (key: unknown, fallback: unknown) => mockGetSettingNumber(key, fallback),
}));

import { getLeaderboard } from "./service";

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
