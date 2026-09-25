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

const mockListMyCertificates = vi.fn();
vi.mock("@/server/certificates/service", () => ({
  listMyCertificates: (userId: unknown) => mockListMyCertificates(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/certificates");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/certificates", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockListMyCertificates).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns the caller's certificates", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockListMyCertificates.mockResolvedValueOnce([
      {
        worldId: "world_1",
        worldTitle: { en: "Money World", hi: "x", hx: "x" },
        code: "FL-MW-2026-000001",
        xpEarned: 1500,
        accuracyPct: 90,
        issuedAt: new Date("2026-04-17T00:00:00.000Z"),
      },
    ]);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].code).toBe("FL-MW-2026-000001");
    expect(mockListMyCertificates).toHaveBeenCalledWith(USER.id);
  });
});
