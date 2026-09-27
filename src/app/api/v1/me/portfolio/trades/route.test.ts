import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetPortfolioTrades = vi.fn();
vi.mock("@/server/portfolio/service", () => ({
  getPortfolioTrades: (userId: unknown, opts: unknown) => mockGetPortfolioTrades(userId, opts),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest(query = "") {
  return new Request(`http://localhost/api/v1/me/portfolio/trades${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/portfolio/trades", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetPortfolioTrades).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid status", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await GET(makeRequest("?status=bogus"));

    expect(res.status).toBe(400);
    expect(mockGetPortfolioTrades).not.toHaveBeenCalled();
  });

  it("defaults status to 'all', limit to 20, and cursor to null", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPortfolioTrades.mockResolvedValueOnce({ data: [], nextCursor: null });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockGetPortfolioTrades).toHaveBeenCalledWith(USER.id, { status: "all", limit: 20, cursor: null });
  });

  it("forwards an explicit status/limit/cursor", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPortfolioTrades.mockResolvedValueOnce({ data: [], nextCursor: null });

    const res = await GET(makeRequest("?status=closed&limit=5&cursor=abc"));

    expect(res.status).toBe(200);
    expect(mockGetPortfolioTrades).toHaveBeenCalledWith(USER.id, { status: "closed", limit: 5, cursor: "abc" });
  });

  it("returns the page in the list envelope shape", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPortfolioTrades.mockResolvedValueOnce({
      data: [{ kind: "open", symbol: "RELIANCE" }],
      nextCursor: "xyz",
    });

    const res = await GET(makeRequest());

    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBe("xyz");
  });
});
