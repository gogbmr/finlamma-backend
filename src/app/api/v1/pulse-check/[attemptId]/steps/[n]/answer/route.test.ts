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

const mockSubmitAnswer = vi.fn();
vi.mock("@/server/pulse-check/service", () => ({
  submitAnswer: (user: unknown, attemptId: unknown, n: unknown, answer: unknown) =>
    mockSubmitAnswer(user, attemptId, n, answer),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/v1/pulse-check/${ATTEMPT_ID}/steps/1/answer`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/v1/pulse-check/{attemptId}/steps/{n}/answer", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest({ answer: { correctIndex: 0 } }), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID, n: "1" }),
    });

    expect(res.status).toBe(401);
    expect(mockSubmitAnswer).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed answer shape (surfaced from the service)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockSubmitAnswer.mockRejectedValueOnce(new AppError("VALIDATION_FAILED", 'Invalid answer for a "single_select" question'));

    const res = await POST(makeRequest({ answer: { wrong: "shape" } }), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID, n: "1" }),
    });

    expect(res.status).toBe(400);
  });

  it("grades and returns the result on success", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockSubmitAnswer.mockResolvedValueOnce({ isCorrect: true, vmAwarded: 50 });

    const res = await POST(makeRequest({ answer: { correctIndex: 0 } }), {
      params: Promise.resolve({ attemptId: ATTEMPT_ID, n: "1" }),
    });

    expect(res.status).toBe(200);
    expect(mockSubmitAnswer).toHaveBeenCalledWith(USER, ATTEMPT_ID, 1, { correctIndex: 0 });
  });
});
