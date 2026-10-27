import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockPlaceFundOrder = vi.fn();
const mockListMyFundOrders = vi.fn();
vi.mock("@/server/fund-orders/service", () => ({
  placeFundOrder: (user: unknown, input: unknown, key: unknown, meta: unknown) =>
    mockPlaceFundOrder(user, input, key, meta),
  listMyFundOrders: (userId: unknown, opts: unknown) => mockListMyFundOrders(userId, opts),
}));

import { GET, POST } from "./route";

const USER = { id: "u1" };

function makeGetRequest(query: string = ""): Request {
  return new Request(`http://localhost/api/v1/trade/funds/orders${query}`);
}

function makeRequest(body: unknown, idempotencyKey: string | null = "test-key") {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyKey !== null) headers.set("Idempotency-Key", idempotencyKey);
  return new Request("http://localhost/api/v1/trade/funds/orders", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { fundId: "00000000-0000-0000-0000-000000000000", side: "buy", amountPaise: 10000 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/trade/funds/orders", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    expect(mockPlaceFundOrder).not.toHaveBeenCalled();
  });

  it("returns 400 when the Idempotency-Key header is missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest(VALID_BODY, null));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(mockPlaceFundOrder).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body (missing amountPaise on a buy order)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    const bodyWithoutAmount = { fundId: VALID_BODY.fundId, side: VALID_BODY.side };

    const res = await POST(makeRequest(bodyWithoutAmount));

    expect(res.status).toBe(400);
    expect(mockPlaceFundOrder).not.toHaveBeenCalled();
  });

  it("returns 409 with the reason when the order can't be placed right now", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockPlaceFundOrder.mockRejectedValueOnce(new AppError("NAV_STALE", "The latest NAV is too old to trade on"));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(409);
  });

  it("places the order and passes the Idempotency-Key header through", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockPlaceFundOrder.mockResolvedValueOnce({ id: "order_1", fundId: VALID_BODY.fundId, status: "filled", replayed: false });

    const res = await POST(makeRequest(VALID_BODY, "abc-123"));

    expect(res.status).toBe(200);
    expect(mockPlaceFundOrder).toHaveBeenCalledWith(USER, VALID_BODY, "abc-123", expect.any(Object));
    const body = await res.json();
    expect(body.data.id).toBe("order_1");
  });
});

describe("GET /api/v1/trade/funds/orders", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(401);
    expect(mockListMyFundOrders).not.toHaveBeenCalled();
  });

  it("lists the caller's own fund orders with default paging", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockListMyFundOrders.mockResolvedValueOnce({
      data: [{ id: "forder_1", fundId: "fund_1", status: "filled" }],
      nextCursor: null,
    });

    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);
    expect(mockListMyFundOrders).toHaveBeenCalledWith(USER.id, {
      status: undefined,
      idempotencyKey: undefined,
      limit: 20,
      cursor: null,
    });
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it("passes the idempotencyKey filter through, for resolving an outcome-unknown attempt (app ask A16)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockListMyFundOrders.mockResolvedValueOnce({ data: [], nextCursor: null });

    await GET(makeGetRequest("?idempotencyKey=client-key-123"));

    expect(mockListMyFundOrders).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({ idempotencyKey: "client-key-123" }),
    );
  });
});
