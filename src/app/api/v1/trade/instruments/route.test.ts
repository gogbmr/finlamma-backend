import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockListPublicInstruments = vi.fn();
vi.mock("@/server/market/service", () => ({
  listPublicInstruments: () => mockListPublicInstruments(),
}));

import { GET } from "./route";

const USER = { id: "u1" };

function makeRequest() {
  return new Request("http://localhost/api/v1/trade/instruments");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/trade/instruments", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    expect(mockListPublicInstruments).not.toHaveBeenCalled();
  });

  it("returns 403 when full access is required and missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockRejectedValueOnce(new AppError("FORBIDDEN", "nope"));

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
  });

  it("returns instruments with a top-level disclaimer", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockListPublicInstruments.mockResolvedValueOnce({
      data: [{ symbol: "RELIANCE", quote: null }],
      disclaimer: "test disclaimer",
    });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].symbol).toBe("RELIANCE");
    expect(body.disclaimer).toBe("test disclaimer");
  });
});
