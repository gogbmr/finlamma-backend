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

const mockGetVmoneyStats = vi.fn();
vi.mock("@/server/economy/service", () => ({
  getVmoneyStats: (userId: unknown) => mockGetVmoneyStats(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/stats/vmoney");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/stats/vmoney", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetVmoneyStats).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns the caller's V Money stats, never accepting a user id from the request", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetVmoneyStats.mockResolvedValueOnce({ balance: 210, weeklyEarned: 90, weeklySpent: 0 });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ balance: 210, weeklyEarned: 90, weeklySpent: 0 });
    expect(mockGetVmoneyStats).toHaveBeenCalledWith("u1");
  });

  it("a zero-activity user reads balance 0", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetVmoneyStats.mockResolvedValueOnce({ balance: 0, weeklyEarned: 0, weeklySpent: 0 });

    const res = await GET(makeRequest());

    const body = await res.json();
    expect(body.data).toEqual({ balance: 0, weeklyEarned: 0, weeklySpent: 0 });
  });
});
