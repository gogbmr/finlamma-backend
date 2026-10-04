import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockMarkMyNotificationsRead = vi.fn();
vi.mock("@/server/notifications/service", () => ({
  markMyNotificationsRead: (...args: unknown[]) => mockMarkMyNotificationsRead(...args),
}));

import { POST } from "./route";

const USER = { id: "u1" };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/v1/me/notifications/mark-read", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER);
  mockRequireFullAccess.mockResolvedValue(undefined);
});

describe("POST /api/v1/me/notifications/mark-read", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(401);
  });

  it("marks all when ids omitted", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(mockMarkMyNotificationsRead).toHaveBeenCalledWith({ id: "u1" }, undefined);
  });

  it("marks only the given ids", async () => {
    const res = await POST(makeRequest({ ids: ["11111111-1111-4111-8111-111111111111"] }));

    expect(res.status).toBe(200);
    expect(mockMarkMyNotificationsRead).toHaveBeenCalledWith({ id: "u1" }, ["11111111-1111-4111-8111-111111111111"]);
  });
});
