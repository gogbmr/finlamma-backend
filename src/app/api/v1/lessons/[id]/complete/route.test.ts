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

const mockCompleteUngradedLesson = vi.fn();
vi.mock("@/server/lesson-progress/service", () => ({
  completeUngradedLesson: (...args: unknown[]) => mockCompleteUngradedLesson(...args),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const LESSON_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new Request(`http://localhost/api/v1/lessons/${LESSON_ID}/complete`, { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
  mockCheckRateLimit.mockResolvedValue({ allowed: true, configured: true });
});

describe("POST /api/v1/lessons/{id}/complete", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(401);
    expect(mockCompleteUngradedLesson).not.toHaveBeenCalled();
  });

  it("returns 429 without calling the service when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, configured: true });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(429);
    expect(mockCompleteUngradedLesson).not.toHaveBeenCalled();
  });

  it("returns 409 when the lesson wasn't served first", async () => {
    mockCompleteUngradedLesson.mockRejectedValueOnce(
      new AppError("CONFLICT", "Not served yet - call POST /lessons/{id}/serve first"),
    );

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(409);
  });

  it("returns 429 LESSON_TOO_SOON when the minimum time hasn't elapsed", async () => {
    mockCompleteUngradedLesson.mockRejectedValueOnce(
      new AppError("LESSON_TOO_SOON", "Spend a bit more time here before completing (180s minimum, 5s so far)", {
        minSeconds: 180,
        secondsElapsed: 5,
      }),
    );

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("LESSON_TOO_SOON");
  });

  it("completes and credits when eligible", async () => {
    mockCompleteUngradedLesson.mockResolvedValueOnce({
      lessonId: LESSON_ID,
      status: "completed",
      completedAt: "2026-01-01T00:10:00.000Z",
      credited: true,
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.credited).toBe(true);
    expect(mockCompleteUngradedLesson).toHaveBeenCalledWith(USER, LESSON_ID, expect.anything());
  });

  it("a replay of an already-completed lesson returns credited: false", async () => {
    mockCompleteUngradedLesson.mockResolvedValueOnce({
      lessonId: LESSON_ID,
      status: "completed",
      completedAt: "2026-01-01T00:05:00.000Z",
      credited: false,
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LESSON_ID }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.credited).toBe(false);
  });
});
