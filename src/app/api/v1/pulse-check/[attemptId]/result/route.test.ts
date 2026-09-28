import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetResult = vi.fn();
vi.mock("@/server/pulse-check/service", () => ({
  getResult: (user: unknown, attemptId: unknown) => mockGetResult(user, attemptId),
}));

import { GET } from "./route";

const USER = { id: "u1" };
const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";

function makeRequest() {
  return new Request(`http://localhost/api/v1/pulse-check/${ATTEMPT_ID}/result`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/pulse-check/{attemptId}/result", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID }) });

    expect(res.status).toBe(401);
    expect(mockGetResult).not.toHaveBeenCalled();
  });

  it("returns 409 when the attempt isn't finished yet", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetResult.mockRejectedValueOnce(new AppError("CONFLICT", "This attempt isn't finished yet"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID }) });

    expect(res.status).toBe(409);
  });

  it("returns the result on success", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetResult.mockResolvedValueOnce({ attemptId: ATTEMPT_ID, accuracyPct: 100, answers: [] });

    const res = await GET(makeRequest(), { params: Promise.resolve({ attemptId: ATTEMPT_ID }) });

    expect(res.status).toBe(200);
    expect(mockGetResult).toHaveBeenCalledWith(USER, ATTEMPT_ID);
  });
});
