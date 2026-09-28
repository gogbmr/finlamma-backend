import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockStartAttempt = vi.fn();
vi.mock("@/server/pulse-check/service", () => ({
  startAttempt: (user: unknown, meta: unknown) => mockStartAttempt(user, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };
function makeRequest() {
  return new Request("http://localhost/api/v1/pulse-check/start", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/pulse-check/start", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockStartAttempt).not.toHaveBeenCalled();
  });

  it("returns 404 when no Pulse Check is available yet today", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockStartAttempt.mockRejectedValueOnce(new AppError("NOT_FOUND", "No Pulse Check questions are available yet today"));

    const res = await POST(makeRequest());

    expect(res.status).toBe(404);
  });

  it("starts (or resumes) an attempt on success", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockStartAttempt.mockResolvedValueOnce({ attemptId: "a1", editionId: "e1", totalSteps: 8, resumed: false });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockStartAttempt).toHaveBeenCalledWith(USER, expect.any(Object));
  });
});
