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

const mockGetMyRewards = vi.fn();
vi.mock("@/server/rewards/service", () => ({
  getMyRewards: (userId: unknown) => mockGetMyRewards(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/rewards");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/rewards", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetMyRewards).not.toHaveBeenCalled();
  });

  it("returns the reward catalog with claimed state", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyRewards.mockResolvedValueOnce([{ id: "reward_1", priceVm: 500, claimed: false }]);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].claimed).toBe(false);
    expect(mockGetMyRewards).toHaveBeenCalledWith(USER.id);
  });
});
