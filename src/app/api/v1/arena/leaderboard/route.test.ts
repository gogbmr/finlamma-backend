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

const mockGetLeaderboard = vi.fn();
vi.mock("@/server/arena/service", () => ({
  getLeaderboard: (user: unknown, scope: unknown) => mockGetLeaderboard(user, scope),
}));

import { GET } from "./route";

const USER = { id: "u1", state: "Maharashtra" };

function makeRequest(scope?: string) {
  const url = scope
    ? `http://localhost/api/v1/arena/leaderboard?scope=${scope}`
    : "http://localhost/api/v1/arena/leaderboard";
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/arena/leaderboard", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest("global"));

    expect(res.status).toBe(401);
    expect(mockGetLeaderboard).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest("global"));

    expect(res.status).toBe(403);
  });

  it("returns 400 for a missing scope", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await GET(makeRequest());

    expect(res.status).toBe(400);
    expect(mockGetLeaderboard).not.toHaveBeenCalled();
  });

  it("returns 400 for an unrecognized scope value", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await GET(makeRequest("school"));

    expect(res.status).toBe(400);
  });

  it("passes the parsed scope and the caller (never a user id from the request) to the service", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetLeaderboard.mockResolvedValueOnce({
      requestedScope: "global",
      scope: "global",
      fallbackApplied: false,
      notEnoughPlayers: false,
      weekStartDate: "2026-09-28",
      poolSize: 3,
      rows: [],
      self: null,
    });

    const res = await GET(makeRequest("global"));

    expect(res.status).toBe(200);
    expect(mockGetLeaderboard).toHaveBeenCalledWith(USER, "global");
    const body = await res.json();
    expect(body.data.scope).toBe("global");
  });
});
