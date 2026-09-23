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

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/redis", () => ({
  checkRateLimit: (identifier: unknown, config: unknown, failOpen: unknown) =>
    mockCheckRateLimit(identifier, config, failOpen),
  LESSON_STEP_RATE_LIMIT: { requests: 30, window: "10 s", prefix: "ratelimit:lesson-step" },
}));

const mockServeStep = vi.fn();
vi.mock("@/server/quiz-attempts/service", () => ({
  serveStep: (...args: unknown[]) => mockServeStep(...args),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const LESSON_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new Request(`http://localhost/api/v1/lessons/${LESSON_ID}/steps/1/serve`, { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, configured: true });
});

describe("POST /api/v1/lessons/{id}/steps/{n}/serve", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID, n: "1" }) });

    expect(res.status).toBe(401);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockServeStep).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID, n: "1" }) });

    expect(res.status).toBe(403);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("rate-limits by the caller's user id, using the shared lesson-step limiter, failing open", async () => {
    mockServeStep.mockResolvedValueOnce({ attemptId: "a1" });

    await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID, n: "1" }) });

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "u1",
      { requests: 30, window: "10 s", prefix: "ratelimit:lesson-step" },
      true,
    );
  });

  it("returns 429 without calling serveStep when the rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, configured: true });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID, n: "1" }) });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(mockServeStep).not.toHaveBeenCalled();
  });

  it("serves the step when under the rate limit", async () => {
    mockServeStep.mockResolvedValueOnce({ attemptId: "a1", stepIndex: 1 });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID, n: "1" }) });

    expect(res.status).toBe(200);
    expect(mockServeStep).toHaveBeenCalledWith(USER, LESSON_ID, 1, expect.anything());
  });
});
