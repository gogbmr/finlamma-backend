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

const mockGetNewsStoryDetail = vi.fn();
vi.mock("@/server/news/service", () => ({
  getNewsStoryDetail: (userId: unknown, id: unknown) => mockGetNewsStoryDetail(userId, id),
}));

import { GET } from "./route";

const USER = { id: "u1" };
const STORY_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new Request(`http://localhost/api/v1/news/${STORY_ID}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/news/{id}", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(401);
    expect(mockGetNewsStoryDetail).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-uuid id", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(res.status).toBe(400);
    expect(mockGetNewsStoryDetail).not.toHaveBeenCalled();
  });

  it("returns 404 when the service throws NOT_FOUND", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetNewsStoryDetail.mockRejectedValueOnce(new AppError("NOT_FOUND", "No published news story with this id"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(404);
  });

  it("returns the story detail on success", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetNewsStoryDetail.mockResolvedValueOnce({ id: STORY_ID, minReadSeconds: 20 });

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(200);
    expect(mockGetNewsStoryDetail).toHaveBeenCalledWith(USER.id, STORY_ID);
  });
});
