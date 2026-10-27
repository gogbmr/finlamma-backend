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

const mockBookmarkNewsStory = vi.fn();
const mockUnbookmarkNewsStory = vi.fn();
vi.mock("@/server/news/service", () => ({
  bookmarkNewsStory: (user: unknown, id: unknown) => mockBookmarkNewsStory(user, id),
  unbookmarkNewsStory: (user: unknown, id: unknown) => mockUnbookmarkNewsStory(user, id),
}));

import { DELETE, POST } from "./route";

const USER = { id: "u1" };
const STORY_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest(method: "POST" | "DELETE") {
  return new Request(`http://localhost/api/v1/news/${STORY_ID}/bookmark`, { method });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/news/{id}/bookmark", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest("POST"), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(401);
    expect(mockBookmarkNewsStory).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent/unpublished story", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockBookmarkNewsStory.mockRejectedValueOnce(new AppError("NOT_FOUND", "No published news story with this id"));

    const res = await POST(makeRequest("POST"), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(404);
  });

  it("bookmarks the story on success", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockBookmarkNewsStory.mockResolvedValueOnce({ bookmarked: true });

    const res = await POST(makeRequest("POST"), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(200);
    expect(mockBookmarkNewsStory).toHaveBeenCalledWith(USER, STORY_ID);
    const body = await res.json();
    expect(body.data.bookmarked).toBe(true);
  });
});

describe("DELETE /api/v1/news/{id}/bookmark", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await DELETE(makeRequest("DELETE"), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(401);
    expect(mockUnbookmarkNewsStory).not.toHaveBeenCalled();
  });

  it("removes the bookmark on success", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockUnbookmarkNewsStory.mockResolvedValueOnce({ bookmarked: false });

    const res = await DELETE(makeRequest("DELETE"), { params: Promise.resolve({ id: STORY_ID }) });

    expect(res.status).toBe(200);
    expect(mockUnbookmarkNewsStory).toHaveBeenCalledWith(USER, STORY_ID);
    const body = await res.json();
    expect(body.data.bookmarked).toBe(false);
  });
});
