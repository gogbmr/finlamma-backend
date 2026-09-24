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

const mockGetMyBadges = vi.fn();
vi.mock("@/server/badges/service", () => ({
  getMyBadges: (userId: unknown) => mockGetMyBadges(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/badges");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/badges", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetMyBadges).not.toHaveBeenCalled();
  });

  it("returns the caller's badges with progress", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyBadges.mockResolvedValueOnce([
      { id: "badge_1", target: 5, progress: 3, unlocked: false, unlockedAt: null },
    ]);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].progress).toBe(3);
    expect(mockGetMyBadges).toHaveBeenCalledWith(USER.id);
  });
});
