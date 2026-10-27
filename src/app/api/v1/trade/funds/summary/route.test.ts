import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetFundFolioSummary = vi.fn();
vi.mock("@/server/funds/service", () => ({
  getFundFolioSummary: (userId: unknown) => mockGetFundFolioSummary(userId),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/trade/funds/summary");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/trade/funds/summary", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetFundFolioSummary).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns the caller's own fund folio summary", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetFundFolioSummary.mockResolvedValueOnce({
      data: { totalInvestedPaise: 200000, totalCurrentValuePaise: 220000, overallReturnsPaise: 20000, overallReturnsPercent: 10 },
    });

    const res = await GET(makeRequest());

    expect(mockGetFundFolioSummary).toHaveBeenCalledWith("u1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.overallReturnsPercent).toBe(10);
  });
});
