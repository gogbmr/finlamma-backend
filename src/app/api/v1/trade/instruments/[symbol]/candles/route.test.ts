import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetInstrumentCandles = vi.fn();
vi.mock("@/server/market/service", () => ({
  getInstrumentCandles: (symbol: unknown, tf: unknown) => mockGetInstrumentCandles(symbol, tf),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest(query = "") {
  return new Request(`http://localhost/api/v1/trade/instruments/reliance/candles${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/trade/instruments/{symbol}/candles", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ symbol: "reliance" }) });

    expect(res.status).toBe(401);
  });

  it("defaults to the 1M timeframe when tf is omitted", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetInstrumentCandles.mockResolvedValueOnce({ data: [], disclaimer: "x" });

    await GET(makeRequest(), { params: Promise.resolve({ symbol: "reliance" }) });

    expect(mockGetInstrumentCandles).toHaveBeenCalledWith("RELIANCE", "1M");
  });

  it("passes through a valid tf query param", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetInstrumentCandles.mockResolvedValueOnce({ data: [], disclaimer: "x" });

    await GET(makeRequest("?tf=1Y"), { params: Promise.resolve({ symbol: "reliance" }) });

    expect(mockGetInstrumentCandles).toHaveBeenCalledWith("RELIANCE", "1Y");
  });

  it("rejects an invalid tf with VALIDATION_FAILED", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await GET(makeRequest("?tf=5Y"), { params: Promise.resolve({ symbol: "reliance" }) });

    expect(res.status).toBe(400);
    expect(mockGetInstrumentCandles).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown symbol", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetInstrumentCandles.mockRejectedValueOnce(new AppError("NOT_FOUND", "No instrument"));

    const res = await GET(makeRequest(), { params: Promise.resolve({ symbol: "reliance" }) });

    expect(res.status).toBe(404);
  });
});
