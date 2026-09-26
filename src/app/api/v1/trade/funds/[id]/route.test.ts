import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetPublicFund = vi.fn();
vi.mock("@/server/funds/service", () => ({
  getPublicFund: (id: unknown) => mockGetPublicFund(id),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/trade/funds/fund-1");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/trade/funds/{id}", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "fund-1" }) });

    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown fund id", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicFund.mockRejectedValueOnce(new AppError("NOT_FOUND", "No fund with this id"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "nope" }) });

    expect(res.status).toBe(404);
  });

  it("returns the fund's detail with a top-level disclaimer", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicFund.mockResolvedValueOnce({
      data: { id: "fund-1", name: "Finlamma Test Fund" },
      disclaimer: "test disclaimer",
    });

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: "fund-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Finlamma Test Fund");
    expect(mockGetPublicFund).toHaveBeenCalledWith("fund-1");
  });
});
