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

const mockGetMyWalletHistory = vi.fn();
vi.mock("@/server/economy/service", () => ({
  getMyWalletHistory: (userId: unknown, opts: unknown) => mockGetMyWalletHistory(userId, opts),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest(query = "") {
  return new Request(`http://localhost/api/v1/me/wallet/history${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/wallet/history", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetMyWalletHistory).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid limit", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await GET(makeRequest("?limit=-1"));

    expect(res.status).toBe(400);
    expect(mockGetMyWalletHistory).not.toHaveBeenCalled();
  });

  it("defaults limit and forwards a null cursor when none is given", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyWalletHistory.mockResolvedValueOnce({ data: [], nextCursor: null });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockGetMyWalletHistory).toHaveBeenCalledWith(USER.id, { limit: 20, cursor: null });
  });

  it("returns a page with nextCursor at the top level (list envelope)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyWalletHistory.mockResolvedValueOnce({
      data: [{ id: "row_1", amount: -500, sourceType: "reward_claim", reason: "x", createdAt: new Date() }],
      nextCursor: "abc",
    });

    const res = await GET(makeRequest("?limit=1"));

    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBe("abc");
    expect(mockGetMyWalletHistory).toHaveBeenCalledWith(USER.id, { limit: 1, cursor: null });
  });
});
