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

const mockGetPublicLessonsForWorld = vi.fn();
vi.mock("@/server/lessons/service", () => ({
  getPublicLessonsForWorld: (worldId: unknown) => mockGetPublicLessonsForWorld(worldId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/worlds/world_1/lessons");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/worlds/{id}/lessons", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "world_1" }) });

    expect(res.status).toBe(401);
    expect(mockGetPublicLessonsForWorld).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "world_1" }) });

    expect(res.status).toBe(403);
    expect(mockGetPublicLessonsForWorld).not.toHaveBeenCalled();
  });

  it("returns the world's published lesson summaries", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicLessonsForWorld.mockResolvedValueOnce([{ id: "lesson_1", chapter: 1, step: 1 }]);

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "world_1" }) });

    expect(res.status).toBe(200);
    expect(mockGetPublicLessonsForWorld).toHaveBeenCalledWith("world_1");
    const body = await res.json();
    expect(body.data).toEqual([{ id: "lesson_1", chapter: 1, step: 1 }]);
  });
});
