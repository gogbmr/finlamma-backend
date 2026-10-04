import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockGetMyMonetisationStatus = vi.fn();
vi.mock("@/server/monetisation/service", () => ({
  getMyMonetisationStatus: (user: unknown) => mockGetMyMonetisationStatus(user),
}));

import { GET } from "./route";

const USER = { id: "u1", dateOfBirth: "2010-01-01" };

function makeRequest() {
  return new Request("http://localhost/api/v1/me/entitlements");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/me/entitlements", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetMyMonetisationStatus).not.toHaveBeenCalled();
  });

  it("returns the caller's entitlements and ad/subscription eligibility", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockGetMyMonetisationStatus.mockResolvedValueOnce({
      entitlements: [],
      showAds: true,
      nonPersonalizedAdsRequired: true,
      canSubscribe: false,
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      entitlements: [],
      showAds: true,
      nonPersonalizedAdsRequired: true,
      canSubscribe: false,
    });
    expect(mockGetMyMonetisationStatus).toHaveBeenCalledWith(USER);
  });
});
