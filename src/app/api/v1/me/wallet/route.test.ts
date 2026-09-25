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

const mockGetMyWallet = vi.fn();
vi.mock("@/server/economy/service", () => ({
  getMyWallet: (userId: unknown) => mockGetMyWallet(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/wallet");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/wallet", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetMyWallet).not.toHaveBeenCalled();
  });

  it("returns the caller's wallet summary", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyWallet.mockResolvedValueOnce({
      balance: 1250,
      earnedThisMonth: 300,
      earnedBySource: [{ sourceType: "lesson_completion", amount: 300 }],
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.balance).toBe(1250);
    expect(mockGetMyWallet).toHaveBeenCalledWith(USER.id);
  });
});
