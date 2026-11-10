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

const mockGetNewsFeed = vi.fn();
vi.mock("@/server/news/service", () => ({
  getNewsFeed: (userId: unknown, opts: unknown) => mockGetNewsFeed(userId, opts),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest(query = "") {
  return new Request(`http://localhost/api/v1/news/feed${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/news/feed", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetNewsFeed).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid category", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await GET(makeRequest("?category=not_a_real_category"));

    expect(res.status).toBe(400);
    expect(mockGetNewsFeed).not.toHaveBeenCalled();
  });

  it("defaults to no category filter and forwards limit/cursor", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetNewsFeed.mockResolvedValueOnce({ data: [], nextCursor: null });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockGetNewsFeed).toHaveBeenCalledWith(USER.id, { limit: 20, cursor: null, category: null });
  });

  // Data-quality fix: this endpoint used to wrap the service's own
  // {data, nextCursor} result inside ok()'s own {data: ...} envelope,
  // shipping {data: {data: [...], nextCursor}} - one level deeper than
  // NewsFeedResponseSchema documents ({data: [...], nextCursor}). An app
  // reading response.data as the story array got an object instead,
  // which is exactly how "headline undefined" surfaced with a perfectly
  // clean database behind it. okList() is the fix - same shape every
  // other cursor-paginated endpoint (GET /trade/orders, GET
  // /me/notifications, ...) already uses.
  it("returns the documented {data: [...], nextCursor} shape, not double-wrapped", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    const story = { id: "story_1", headline: { en: "H", hi: "H", hx: "H" } };
    mockGetNewsFeed.mockResolvedValueOnce({ data: [story], nextCursor: "abc" });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body).toEqual({ data: [story], nextCursor: "abc" });
  });

  it("passes a valid category through", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetNewsFeed.mockResolvedValueOnce({ data: [], nextCursor: null });

    await GET(makeRequest("?category=rbi_rates"));

    expect(mockGetNewsFeed).toHaveBeenCalledWith(USER.id, { limit: 20, cursor: null, category: "rbi_rates" });
  });
});
