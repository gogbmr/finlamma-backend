import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetPublicInstrumentBySymbol = vi.fn();
vi.mock("@/server/market/service", () => ({
  getPublicInstrumentBySymbol: (symbol: unknown) => mockGetPublicInstrumentBySymbol(symbol),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/trade/instruments/reliance");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/trade/instruments/{symbol}", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ symbol: "reliance" }) });

    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown symbol", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicInstrumentBySymbol.mockRejectedValueOnce(new AppError("NOT_FOUND", "No instrument"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ symbol: "reliance" }) });

    expect(res.status).toBe(404);
  });

  it("uppercases the symbol before looking it up", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetPublicInstrumentBySymbol.mockResolvedValueOnce({
      data: { symbol: "RELIANCE" },
      disclaimer: "test disclaimer",
    });

    const res = await GET(makeRequest(), { params: Promise.resolve({ symbol: "reliance" }) });

    expect(mockGetPublicInstrumentBySymbol).toHaveBeenCalledWith("RELIANCE");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.symbol).toBe("RELIANCE");
    expect(body.disclaimer).toBe("test disclaimer");
  });
});
