import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetCompetitionLeaderboard = vi.fn();
vi.mock("@/server/competitions/service", () => ({
  getCompetitionLeaderboard: (user: unknown) => mockGetCompetitionLeaderboard(user),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/arena/competitions/current/leaderboard");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/arena/competitions/current/leaderboard", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetCompetitionLeaderboard).not.toHaveBeenCalled();
  });

  it("returns null data when there's no active competition", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetCompetitionLeaderboard.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it("returns the ranked board with only kid-safe display fields", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetCompetitionLeaderboard.mockResolvedValueOnce({
      rows: [{ rank: 1, userId: "u2", firstName: "Aarav", lastInitial: "S", roiPctBasisPoints: 900, isSelf: false }],
      poolSize: 50,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.poolSize).toBe(50);
    expect(body.data.rows[0]).not.toHaveProperty("email");
  });
});
