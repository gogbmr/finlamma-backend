import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetPublicProfile = vi.fn();
vi.mock("@/server/arena/service", () => ({
  getPublicProfile: (userId: unknown) => mockGetPublicProfile(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };
const TARGET_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";

function makeRequest() {
  return new Request(`http://localhost/api/v1/users/${TARGET_ID}/public-profile`);
}

function makeParams(userId: string) {
  return { params: Promise.resolve({ userId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/users/[userId]/public-profile", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), makeParams(TARGET_ID));

    expect(res.status).toBe(401);
  });

  it("returns 404 for a learner that doesn't exist", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicProfile.mockRejectedValueOnce(new AppError("NOT_FOUND", "Learner not found"));

    const res = await GET(makeRequest(), makeParams(TARGET_ID));

    expect(res.status).toBe(404);
  });

  it("returns the public profile for the id in the URL", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicProfile.mockResolvedValueOnce({
      firstName: "Meera",
      lastInitial: "K",
      level: 4,
      rankTitle: null,
      badges: [],
      chips: [],
      weekXp: 100,
      streak: { current: 1, longest: 1 },
      quizAccuracyPct: null,
      currentWorld: null,
    });

    const res = await GET(makeRequest(), makeParams(TARGET_ID));

    expect(res.status).toBe(200);
    expect(mockGetPublicProfile).toHaveBeenCalledWith(TARGET_ID);
    const body = await res.json();
    expect(body.data.firstName).toBe("Meera");
    expect(body.data).not.toHaveProperty("email");
  });
});
