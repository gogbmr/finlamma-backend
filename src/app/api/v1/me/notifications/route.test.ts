import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockListMyNotifications = vi.fn();
vi.mock("@/server/notifications/service", () => ({
  listMyNotifications: (...args: unknown[]) => mockListMyNotifications(...args),
}));

import { GET } from "./route";

const USER = { id: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
});

describe("GET /api/v1/me/notifications", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(new Request("http://localhost/api/v1/me/notifications"));

    expect(res.status).toBe(401);
  });

  it("returns a page of notifications", async () => {
    mockListMyNotifications.mockResolvedValueOnce({
      data: [{ id: "n1", kind: "session_goal", title: "Goal reached!", body: "Nice work", data: null, readAt: null, createdAt: "2026-09-30T00:00:00.000Z" }],
      nextCursor: null,
    });

    const res = await GET(new Request("http://localhost/api/v1/me/notifications?limit=10"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
    expect(mockListMyNotifications).toHaveBeenCalledWith({ id: "u1" }, { limit: 10, cursor: null });
  });
});
