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

const mockServeStep = vi.fn();
vi.mock("@/server/pulse-check/service", () => ({
  serveStep: (user: unknown, attemptId: unknown, n: unknown) => mockServeStep(user, attemptId, n),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new Request(`http://localhost/api/v1/pulse-check/${ATTEMPT_ID}/steps/1/serve`, { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/v1/pulse-check/{attemptId}/steps/{n}/serve", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID, n: "1" }) });

    expect(res.status).toBe(401);
    expect(mockServeStep).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false });

    const res = await POST(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID, n: "1" }) });

    expect(res.status).toBe(429);
    expect(mockServeStep).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid step number", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID, n: "not-a-number" }) });

    expect(res.status).toBe(400);
    expect(mockServeStep).not.toHaveBeenCalled();
  });

  it("returns 409 when out of sequence", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockServeStep.mockRejectedValueOnce(new AppError("CONFLICT", "Answer the previous question first"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID, n: "2" }) });

    expect(res.status).toBe(409);
  });

  it("serves the question on success", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockServeStep.mockResolvedValueOnce({ stepIndex: 1, totalSteps: 8, question: { questionId: "q1" } });

    const res = await POST(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID, n: "1" }) });

    expect(res.status).toBe(200);
    expect(mockServeStep).toHaveBeenCalledWith(USER, ATTEMPT_ID, 1);
  });
});
