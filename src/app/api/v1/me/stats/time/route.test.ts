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

const mockGetTodaySessionSeconds = vi.fn();
vi.mock("@/server/session-time/service", () => ({
  getTodaySessionSeconds: (userId: unknown) => mockGetTodaySessionSeconds(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/stats/time");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/stats/time", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetTodaySessionSeconds).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns the caller's today-seconds total", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetTodaySessionSeconds.mockResolvedValueOnce(1140);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ todaySeconds: 1140 });
    expect(mockGetTodaySessionSeconds).toHaveBeenCalledWith("u1");
  });
});
