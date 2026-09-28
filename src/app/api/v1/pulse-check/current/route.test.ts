import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetCurrentPulseCheck = vi.fn();
vi.mock("@/server/pulse-check/service", () => ({
  getCurrentPulseCheck: (userId: unknown) => mockGetCurrentPulseCheck(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };
function makeRequest() {
  return new Request("http://localhost/api/v1/pulse-check/current");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/pulse-check/current", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetCurrentPulseCheck).not.toHaveBeenCalled();
  });

  it("returns today's meta on success", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetCurrentPulseCheck.mockResolvedValueOnce({ editionId: null, alreadyCompletedToday: false });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockGetCurrentPulseCheck).toHaveBeenCalledWith(USER.id);
  });
});
