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

const mockGetCurrentLesson = vi.fn();
vi.mock("@/server/lessons/service", () => ({
  getCurrentLesson: () => mockGetCurrentLesson(),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/current-lesson");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/current-lesson", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetCurrentLesson).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    expect(mockGetCurrentLesson).not.toHaveBeenCalled();
  });

  it("returns 404 when there's no current lesson yet", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetCurrentLesson.mockRejectedValueOnce(new AppError("NOT_FOUND", "No published worlds yet"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(404);
  });

  it("returns the current lesson", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetCurrentLesson.mockResolvedValueOnce({ id: "lesson_1", chapter: 1, step: 1 });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("lesson_1");
  });
});
