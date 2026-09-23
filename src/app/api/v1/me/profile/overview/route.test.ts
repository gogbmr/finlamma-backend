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

const mockGetProfileOverview = vi.fn();
vi.mock("@/server/profile/service", () => ({
  getProfileOverview: (user: unknown) => mockGetProfileOverview(user),
}));

import { GET } from "./route";

const USER = { id: "u1", firstName: "Aarav", lastInitial: "S" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/profile/overview");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/profile/overview", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetProfileOverview).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("passes the whole authenticated user row through - never a user id from the request body/query", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetProfileOverview.mockResolvedValueOnce({
      firstName: "Aarav",
      lastInitial: "S",
      joinedAt: new Date("2026-01-05T09:12:00.000Z"),
      level: 3,
      totalXp: 1000,
      xpIntoLevel: 300,
      xpToNextLevel: 200,
      rankTitle: { en: "Sprout", hi: "x", hx: "x" },
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.firstName).toBe("Aarav");
    expect(body.data.level).toBe(3);
    expect(body.data.rankTitle).toEqual({ en: "Sprout", hi: "x", hx: "x" });
    expect(mockGetProfileOverview).toHaveBeenCalledWith(USER);
  });

  it("a zero-activity user reads level 1 and a null rank title if none qualifies yet", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetProfileOverview.mockResolvedValueOnce({
      firstName: "Aarav",
      lastInitial: "S",
      joinedAt: new Date("2026-01-05T09:12:00.000Z"),
      level: 1,
      totalXp: 0,
      xpIntoLevel: 0,
      xpToNextLevel: 300,
      rankTitle: null,
    });

    const res = await GET(makeRequest());

    const body = await res.json();
    expect(body.data.level).toBe(1);
    expect(body.data.totalXp).toBe(0);
    expect(body.data.rankTitle).toBeNull();
  });
});
