import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockGetIndexQuotes = vi.fn();
vi.mock("@/server/market/service", () => ({
  getIndexQuotes: () => mockGetIndexQuotes(),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/trade/indices");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/trade/indices", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockGetIndexQuotes).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns the index strip with the trading disclaimer", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockGetIndexQuotes.mockResolvedValueOnce({
      data: {
        indices: [
          { symbol: "NIFTY50", name: "NIFTY 50", valuePaise: 2450035, changePaise: 12500, changePercent: 0.51, asOf: "2026-09-25T10:00:00.000Z" },
        ],
      },
      disclaimer: "disclaimer text",
      disclaimerLocalized: { en: "disclaimer text", hi: "hi", hx: "hx" },
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.indices).toHaveLength(1);
    expect(body.data.indices[0].symbol).toBe("NIFTY50");
    expect(body.disclaimer).toBe("disclaimer text");
    expect(body.disclaimerLocalized.hi).toBe("hi");
  });
});
