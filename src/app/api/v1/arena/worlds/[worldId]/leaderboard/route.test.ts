import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetWorldLeaderboard = vi.fn();
vi.mock("@/server/arena/service", () => ({
  getWorldLeaderboard: (user: unknown, worldId: unknown) => mockGetWorldLeaderboard(user, worldId),
}));

import { GET } from "./route";

const USER = { id: "u1" };
const WORLD_ID = "c1c6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";

function makeRequest() {
  return new Request(`http://localhost/api/v1/arena/worlds/${WORLD_ID}/leaderboard`);
}

function makeParams(worldId: string) {
  return { params: Promise.resolve({ worldId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/arena/worlds/[worldId]/leaderboard", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), makeParams(WORLD_ID));

    expect(res.status).toBe(401);
  });

  it("passes the world id from the URL, not the caller's own current world, to the service", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetWorldLeaderboard.mockResolvedValueOnce({
      requestedScope: `world:${WORLD_ID}`,
      scope: `world:${WORLD_ID}`,
      fallbackApplied: false,
      notEnoughPlayers: false,
      weekStartDate: "2026-09-28",
      poolSize: 30,
      rows: [],
      self: null,
    });

    const res = await GET(makeRequest(), makeParams(WORLD_ID));

    expect(res.status).toBe(200);
    expect(mockGetWorldLeaderboard).toHaveBeenCalledWith(USER, WORLD_ID);
  });
});
