import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockPlaceCompetitionTrade = vi.fn();
const mockListMyCompetitionTrades = vi.fn();
vi.mock("@/server/competitions/service", () => ({
  placeCompetitionTrade: (user: unknown, input: unknown, key: unknown, meta: unknown) =>
    mockPlaceCompetitionTrade(user, input, key, meta),
  listMyCompetitionTrades: (user: unknown, opts: unknown) => mockListMyCompetitionTrades(user, opts),
}));

import { GET, POST } from "./route";

const USER = { id: "u1" };
const VALID_BODY = { side: "buy", qty: 5 };

function makeGetRequest(query: string = ""): Request {
  return new Request(`http://localhost/api/v1/arena/competitions/current/trades${query}`);
}

function makeRequest(body: unknown, idempotencyKey: string | null = "test-key") {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyKey !== null) headers.set("Idempotency-Key", idempotencyKey);
  return new Request("http://localhost/api/v1/arena/competitions/current/trades", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/arena/competitions/current/trades", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    expect(mockPlaceCompetitionTrade).not.toHaveBeenCalled();
  });

  it("returns 400 when the Idempotency-Key header is missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest(VALID_BODY, null));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(mockPlaceCompetitionTrade).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest({ side: "buy", qty: -1 }));

    expect(res.status).toBe(400);
    expect(mockPlaceCompetitionTrade).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller hasn't entered the competition", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockPlaceCompetitionTrade.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Enter the competition before trading in it"),
    );

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(403);
  });

  it("returns 409 when the max-trades limit has been reached", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockPlaceCompetitionTrade.mockRejectedValueOnce(
      new AppError("COMPETITION_MAX_TRADES_REACHED", "You've reached the 10-trade limit for this competition"),
    );

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(409);
  });

  it("places the trade and passes the Idempotency-Key header through", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockPlaceCompetitionTrade.mockResolvedValueOnce({
      id: "trade_1",
      side: "buy",
      qty: 5,
      fillPricePaise: 10000,
      realizedPnlPaise: null,
      filledAt: new Date("2026-10-05T00:00:00.000Z"),
      replayed: false,
    });

    const res = await POST(makeRequest(VALID_BODY, "abc-123"));

    expect(res.status).toBe(200);
    expect(mockPlaceCompetitionTrade).toHaveBeenCalledWith(USER, VALID_BODY, "abc-123", expect.any(Object));
    const body = await res.json();
    expect(body.data.id).toBe("trade_1");
  });
});

describe("GET /api/v1/arena/competitions/current/trades", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(401);
    expect(mockListMyCompetitionTrades).not.toHaveBeenCalled();
  });

  it("returns 404 when no competition is currently active", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockListMyCompetitionTrades.mockRejectedValueOnce(new AppError("NOT_FOUND", "No active competition right now"));

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(404);
  });

  it("lists the caller's own trades with default paging", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockListMyCompetitionTrades.mockResolvedValueOnce({
      data: [{ id: "trade_1", side: "buy", qty: 5, fillPricePaise: 10000, realizedPnlPaise: null, filledAt: "2026-10-05T00:00:00.000Z" }],
      nextCursor: null,
    });

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    expect(mockListMyCompetitionTrades).toHaveBeenCalledWith(USER, { idempotencyKey: undefined, limit: 20, cursor: null });
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it("passes the idempotencyKey filter through (app ask A11)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockListMyCompetitionTrades.mockResolvedValueOnce({ data: [], nextCursor: null });

    await GET(makeGetRequest("?idempotencyKey=client-key-123"));

    expect(mockListMyCompetitionTrades).toHaveBeenCalledWith(USER, expect.objectContaining({ idempotencyKey: "client-key-123" }));
  });
});
