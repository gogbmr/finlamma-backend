import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetMyCompetitionStatus = vi.fn();
vi.mock("@/server/competitions/service", () => ({
  getMyCompetitionStatus: (user: unknown) => mockGetMyCompetitionStatus(user),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/arena/competitions/current/me");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/arena/competitions/current/me", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetMyCompetitionStatus).not.toHaveBeenCalled();
  });

  it("returns null data when there's no active competition", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyCompetitionStatus.mockResolvedValueOnce(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it("returns entered:false when the caller hasn't entered", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyCompetitionStatus.mockResolvedValueOnce({ entered: false });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ entered: false });
  });

  it("returns the caller's live rank/ROI when entered", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetMyCompetitionStatus.mockResolvedValueOnce({
      entered: true,
      rank: 4,
      poolSize: 120,
      roiPctBasisPoints: 350,
      tradeCount: 6,
      cashPaise: 4_000_000,
      qtyHeld: 20,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rank).toBe(4);
  });
});
