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

const mockGetMyCertificate = vi.fn();
vi.mock("@/server/certificates/service", () => ({
  getMyCertificate: (userId: unknown, worldId: unknown) => mockGetMyCertificate(userId, worldId),
}));

import { GET } from "./route";

const USER = { id: "u1" };
const WORLD_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";

function makeRequest() {
  return new Request(`http://localhost/api/v1/me/certificates/${WORLD_ID}`);
}
function makeParams(worldId = WORLD_ID) {
  return { params: Promise.resolve({ worldId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/certificates/[worldId]", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    expect(mockGetMyCertificate).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(403);
  });

  it("returns 404 when no certificate exists for this world", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyCertificate.mockRejectedValueOnce(new AppError("NOT_FOUND", "No certificate for this world yet"));

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(404);
  });

  it("returns the certificate, passing the whole authenticated user id and worldId through", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyCertificate.mockResolvedValueOnce({
      worldId: WORLD_ID,
      worldTitle: { en: "Money World", hi: "x", hx: "x" },
      code: "FL-MW-2026-000001",
      xpEarned: 1500,
      accuracyPct: 90,
      issuedAt: new Date("2026-04-17T00:00:00.000Z"),
    });

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.code).toBe("FL-MW-2026-000001");
    expect(mockGetMyCertificate).toHaveBeenCalledWith(USER.id, WORLD_ID);
  });
});
