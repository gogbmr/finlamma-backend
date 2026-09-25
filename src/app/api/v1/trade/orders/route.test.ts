import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockPlaceOrder = vi.fn();
vi.mock("@/server/orders/service", () => ({
  placeOrder: (user: unknown, input: unknown, key: unknown, meta: unknown) =>
    mockPlaceOrder(user, input, key, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };

function makeRequest(body: unknown, idempotencyKey: string | null = "test-key") {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyKey !== null) headers.set("Idempotency-Key", idempotencyKey);
  return new Request("http://localhost/api/v1/trade/orders", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_BODY = { symbol: "RELIANCE", side: "buy", type: "market", qty: 1 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/trade/orders", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });

  it("returns 400 when the Idempotency-Key header is missing", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest(VALID_BODY, null));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body (limitPricePaise on a market order)", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest({ ...VALID_BODY, limitPricePaise: 5000 }));

    expect(res.status).toBe(400);
    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });

  it("returns 409 with the reason when the order can't be placed right now", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockPlaceOrder.mockRejectedValueOnce(new AppError("INSUFFICIENT_MARGIN", "Not enough V Money for this order"));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(409);
  });

  it("places the order and passes the Idempotency-Key header through", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockPlaceOrder.mockResolvedValueOnce({ id: "order_1", symbol: "RELIANCE", status: "filled", replayed: false });

    const res = await POST(makeRequest(VALID_BODY, "abc-123"));

    expect(res.status).toBe(200);
    expect(mockPlaceOrder).toHaveBeenCalledWith(USER, VALID_BODY, "abc-123", expect.any(Object));
    const body = await res.json();
    expect(body.data.id).toBe("order_1");
  });
});
