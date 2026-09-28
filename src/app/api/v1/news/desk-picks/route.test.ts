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

const mockGetNewsDeskPicksForApp = vi.fn();
vi.mock("@/server/news/service", () => ({
  getNewsDeskPicksForApp: () => mockGetNewsDeskPicksForApp(),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/news/desk-picks");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/news/desk-picks", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetNewsDeskPicksForApp).not.toHaveBeenCalled();
  });

  it("returns active desk picks wrapped in data", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetNewsDeskPicksForApp.mockResolvedValueOnce([{ id: "pick_1" }]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });
});
