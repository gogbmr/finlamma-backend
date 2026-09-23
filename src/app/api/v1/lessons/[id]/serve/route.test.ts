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

const mockServeUngradedLesson = vi.fn();
vi.mock("@/server/lesson-progress/service", () => ({
  serveUngradedLesson: (...args: unknown[]) => mockServeUngradedLesson(...args),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const LESSON_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new Request(`http://localhost/api/v1/lessons/${LESSON_ID}/serve`, { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, configured: true });
});

describe("POST /api/v1/lessons/{id}/serve", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(401);
    expect(mockServeUngradedLesson).not.toHaveBeenCalled();
  });

  it("returns 429 without calling the service when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, configured: true });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(429);
    expect(mockServeUngradedLesson).not.toHaveBeenCalled();
  });

  it("returns 400 when the service rejects a graded lesson kind", async () => {
    mockServeUngradedLesson.mockRejectedValueOnce(
      new AppError("VALIDATION_FAILED", '"quiz" lessons use POST /lessons/{id}/steps/{n}/serve, not this endpoint'),
    );

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(400);
  });

  it("serves the lesson when under the rate limit", async () => {
    mockServeUngradedLesson.mockResolvedValueOnce({
      lessonId: LESSON_ID,
      status: "in_progress",
      startedAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(200);
    expect(mockServeUngradedLesson).toHaveBeenCalledWith(USER, LESSON_ID, expect.anything());
  });
});
