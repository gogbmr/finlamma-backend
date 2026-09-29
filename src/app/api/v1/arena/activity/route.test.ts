import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetActivityFeed = vi.fn();
vi.mock("@/server/arena/service", () => ({
  getActivityFeed: () => mockGetActivityFeed(),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/arena/activity");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/arena/activity", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
  });

  it("returns the recent activity feed", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetActivityFeed.mockResolvedValueOnce({
      items: [{ firstName: "Aarav", lastInitial: "S", amount: 80, createdAt: "2026-09-28T10:00:00.000Z" }],
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
  });
});
