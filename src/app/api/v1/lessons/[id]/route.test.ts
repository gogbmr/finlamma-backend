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

const mockGetPublicLesson = vi.fn();
vi.mock("@/server/lessons/service", () => ({
  getPublicLesson: (id: unknown) => mockGetPublicLesson(id),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/lessons/lesson_1");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/lessons/{id}", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "lesson_1" }) });

    expect(res.status).toBe(401);
    expect(mockGetPublicLesson).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "lesson_1" }) });

    expect(res.status).toBe(403);
    expect(mockGetPublicLesson).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown/unpublished lesson", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicLesson.mockRejectedValueOnce(new AppError("NOT_FOUND", "No published lesson with this id"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "lesson_1" }) });

    expect(res.status).toBe(404);
  });

  it("returns the lesson detail", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicLesson.mockResolvedValueOnce({ id: "lesson_1", kind: "quiz" });

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "lesson_1" }) });

    expect(res.status).toBe(200);
    expect(mockGetPublicLesson).toHaveBeenCalledWith("lesson_1");
    const body = await res.json();
    expect(body.data.id).toBe("lesson_1");
  });
});
