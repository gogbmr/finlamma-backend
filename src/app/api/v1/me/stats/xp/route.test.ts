import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: (req: Request) => mockRequireUser(req),
}));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetXpStats = vi.fn();
vi.mock("@/server/leveling/service", () => ({
  getXpStats: (userId: unknown) => mockGetXpStats(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/stats/xp");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/stats/xp", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetXpStats).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns the caller's XP stats, never accepting a user id from the request", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetXpStats.mockResolvedValueOnce({
      level: 3,
      totalXp: 1000,
      currentLevelStartXp: 700,
      nextLevelStartXp: 1200,
      xpIntoLevel: 300,
      xpToNextLevel: 200,
      weeklyXp: 180,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.level).toBe(3);
    expect(body.data.weeklyXp).toBe(180);
    expect(mockGetXpStats).toHaveBeenCalledWith("u1");
  });

  it("a zero-activity user reads level 1 with 0 everywhere", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetXpStats.mockResolvedValueOnce({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
      weeklyXp: 0,
    });

    const res = await GET(makeRequest());

    const body = await res.json();
    expect(body.data).toEqual({
      level: 1,
      totalXp: 0,
      currentLevelStartXp: 0,
      nextLevelStartXp: 300,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
      weeklyXp: 0,
    });
  });
});
