import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockRerollMyHandle = vi.fn();
vi.mock("@/server/peer-handles/service", () => ({
  rerollMyHandle: (user: unknown, meta: unknown) => mockRerollMyHandle(user, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/handle/reroll", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/me/handle/reroll", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockRerollMyHandle).not.toHaveBeenCalled();
  });

  it("rerolls and returns the new handle", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockRerollMyHandle.mockResolvedValueOnce({
      handle: { en: "Bright Bull", hi: "तेज़ बैल", hx: "Bright Bull" },
      nextRerollAvailableAt: "2026-11-11T00:00:00.000Z",
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.handle).toEqual({ en: "Bright Bull", hi: "तेज़ बैल", hx: "Bright Bull" });
    expect(body.data.nextRerollAvailableAt).toBe("2026-11-11T00:00:00.000Z");
    expect(mockRerollMyHandle).toHaveBeenCalledWith(USER, expect.any(Object));
  });

  it("returns 429 when still inside the cooldown", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockRerollMyHandle.mockRejectedValueOnce(
      new AppError("RESEND_TOO_SOON", "You can reroll your handle again in a bit", {
        retryAfterSeconds: 86400,
        nextRerollAvailableAt: "2026-11-11T00:00:00.000Z",
      }),
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
  });
});
