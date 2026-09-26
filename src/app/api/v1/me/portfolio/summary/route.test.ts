import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetPortfolioSummary = vi.fn();
vi.mock("@/server/portfolio/service", () => ({
  getPortfolioSummary: (userId: unknown) => mockGetPortfolioSummary(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/portfolio/summary");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/portfolio/summary", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetPortfolioSummary).not.toHaveBeenCalled();
  });

  it("returns 403 when onboarding/consent/legal isn't complete", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "Complete onboarding before using this feature"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(mockGetPortfolioSummary).not.toHaveBeenCalled();
  });

  it("returns the caller's own portfolio summary", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPortfolioSummary.mockResolvedValueOnce({
      cashBalancePaise: 84000,
      holdingsMarketValuePaise: 24420,
      totalValuePaise: 108420,
      allTimePnlPaise: 8420,
      allTimePnlPct: 8.4,
      equityBarsPaise: [1, 2, 3],
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalValuePaise).toBe(108420);
    expect(mockGetPortfolioSummary).toHaveBeenCalledWith(USER.id);
  });
});
