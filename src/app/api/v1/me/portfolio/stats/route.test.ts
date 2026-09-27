import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetPortfolioStats = vi.fn();
vi.mock("@/server/portfolio/service", () => ({
  getPortfolioStats: (userId: unknown) => mockGetPortfolioStats(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/portfolio/stats");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/portfolio/stats", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetPortfolioStats).not.toHaveBeenCalled();
  });

  it("returns 403 when onboarding/consent/legal isn't complete", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "Complete onboarding before using this feature"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns the caller's own trading stats", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPortfolioStats.mockResolvedValueOnce({
      totalClosedTrades: 42,
      realizedPnlPaise: 624000,
      winCount: 26,
      lossCount: 16,
      winRatePct: 61.9,
      avgHoldDays: 3.4,
      bestTrade: null,
      worstTrade: null,
      openPositionsCount: 4,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.winRatePct).toBe(61.9);
    expect(mockGetPortfolioStats).toHaveBeenCalledWith(USER.id);
  });
});
