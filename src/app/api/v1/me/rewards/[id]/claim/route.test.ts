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

const mockClaimReward = vi.fn();
vi.mock("@/server/rewards/service", () => ({
  claimReward: (user: unknown, rewardId: unknown, meta: unknown) => mockClaimReward(user, rewardId, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const REWARD_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";

function makeRequest() {
  return new Request(`http://localhost/api/v1/me/rewards/${REWARD_ID}/claim`, { method: "POST" });
}
function makeParams(id = REWARD_ID) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/me/rewards/[id]/claim", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(mockClaimReward).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limiter refuses (including a Redis outage, fails closed)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockClaimReward.mockRejectedValueOnce(
      new AppError("RATE_LIMITED", "Too many claim attempts - slow down and try again shortly"),
    );

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(429);
  });

  it("returns 409 with balance details when V Money is insufficient", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockClaimReward.mockRejectedValueOnce(
      new AppError("INSUFFICIENT_VMONEY", "Not enough V Money - this costs 500, you have 200", {
        priceVm: 500,
        balance: 200,
      }),
    );

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.details).toEqual({ priceVm: 500, balance: 200 });
  });

  it("claims successfully, passing the whole authenticated user and reward id through", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockClaimReward.mockResolvedValueOnce({
      rewardId: REWARD_ID,
      pricePaid: 500,
      alreadyClaimed: false,
      claimedAt: new Date("2026-04-17T00:00:00.000Z"),
    });

    const res = await POST(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pricePaid).toBe(500);
    expect(mockClaimReward).toHaveBeenCalledWith(USER, REWARD_ID, { ip: null, userAgent: null });
  });
});
