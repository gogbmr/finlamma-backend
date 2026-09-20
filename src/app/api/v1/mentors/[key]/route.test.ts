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

const mockGetPublicMentorByKey = vi.fn();
vi.mock("@/server/mentors/service", () => ({
  getPublicMentorByKey: (key: unknown) => mockGetPublicMentorByKey(key),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/mentors/baby");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/mentors/{key}", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "baby" }) });

    expect(res.status).toBe(401);
    expect(mockGetPublicMentorByKey).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "baby" }) });

    expect(res.status).toBe(403);
    expect(mockGetPublicMentorByKey).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown/unpublished key", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicMentorByKey.mockRejectedValueOnce(
      new AppError("NOT_FOUND", 'No published mentor with key "baby"'),
    );

    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "baby" }) });

    expect(res.status).toBe(404);
  });

  it("returns the mentor by key", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicMentorByKey.mockResolvedValueOnce({ key: "baby", order: 1 });

    const res = await GET(makeRequest(), { params: Promise.resolve({ key: "baby" }) });

    expect(res.status).toBe(200);
    expect(mockGetPublicMentorByKey).toHaveBeenCalledWith("baby");
    const body = await res.json();
    expect(body.data.key).toBe("baby");
  });
});
