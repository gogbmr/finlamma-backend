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

const mockGetMyDailyGoals = vi.fn();
vi.mock("@/server/daily-goals/service", () => ({
  getMyDailyGoals: (userId: unknown) => mockGetMyDailyGoals(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/daily-goals");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/daily-goals", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetMyDailyGoals).not.toHaveBeenCalled();
  });

  it("returns only the active goals with today's progress", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyDailyGoals.mockResolvedValueOnce([
      { type: "study_minutes", target: 20, current: 12, completed: false },
      { type: "lesson_completed", target: 1, current: 1, completed: true },
    ]);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[1].completed).toBe(true);
    expect(mockGetMyDailyGoals).toHaveBeenCalledWith(USER.id);
  });
});
