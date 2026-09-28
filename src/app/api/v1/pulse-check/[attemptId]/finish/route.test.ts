import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/redis", () => ({
  checkRateLimit: (userId: unknown, config: unknown, failOpen: unknown) => mockCheckRateLimit(userId, config, failOpen),
  PULSE_CHECK_STEP_RATE_LIMIT: { requests: 30, window: "10 s", prefix: "ratelimit:pulse-check-step" },
}));

const mockFinishAttempt = vi.fn();
vi.mock("@/server/pulse-check/service", () => ({
  finishAttempt: (user: unknown, attemptId: unknown, meta: unknown) => mockFinishAttempt(user, attemptId, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new Request(`http://localhost/api/v1/pulse-check/${ATTEMPT_ID}/finish`, { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/v1/pulse-check/{attemptId}/finish", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID }) });

    expect(res.status).toBe(401);
    expect(mockFinishAttempt).not.toHaveBeenCalled();
  });

  it("returns 409 when not every question has been answered", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockFinishAttempt.mockRejectedValueOnce(new AppError("CONFLICT", "Answer every question before finishing"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID }) });

    expect(res.status).toBe(409);
  });

  it("returns the payout summary on success, surfacing dailyCapReached", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockFinishAttempt.mockResolvedValueOnce({
      accuracyPct: 100,
      totalVmAwardedPaise: 6000,
      rawVmEarnedPaise: 10_000,
      dailyCapReached: true,
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.dailyCapReached).toBe(true);
    expect(mockFinishAttempt).toHaveBeenCalledWith(USER, ATTEMPT_ID, expect.any(Object));
  });
});
