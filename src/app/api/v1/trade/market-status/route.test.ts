import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetMarketStatus = vi.fn();
vi.mock("@/server/market/service", () => ({
  getMarketStatus: (userId: unknown) => mockGetMarketStatus(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/trade/market-status");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/trade/market-status", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetMarketStatus).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns the caller's own market status", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMarketStatus.mockResolvedValueOnce({
      marketOpen: true,
      feedMode: "live",
      globalHalt: false,
      tradingUnlocked: false,
      worldsToGo: 2,
    });

    const res = await GET(makeRequest());

    expect(mockGetMarketStatus).toHaveBeenCalledWith("u1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.worldsToGo).toBe(2);
  });
});
