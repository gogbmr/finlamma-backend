import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetMyUnreadNotificationCount = vi.fn();
vi.mock("@/server/notifications/service", () => ({
  getMyUnreadNotificationCount: (...args: unknown[]) => mockGetMyUnreadNotificationCount(...args),
}));

import { GET } from "./route";

const USER = { id: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
});

describe("GET /api/v1/me/notifications/unread-count", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(new Request("http://localhost/api/v1/me/notifications/unread-count"));

    expect(res.status).toBe(401);
  });

  it("returns the unread count", async () => {
    mockGetMyUnreadNotificationCount.mockResolvedValueOnce(3);

    const res = await GET(new Request("http://localhost/api/v1/me/notifications/unread-count"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ count: 3 });
    expect(mockGetMyUnreadNotificationCount).toHaveBeenCalledWith({ id: "u1" });
  });
});
