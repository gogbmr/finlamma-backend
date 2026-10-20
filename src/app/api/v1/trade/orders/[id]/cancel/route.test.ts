import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (req: Request) => mockRequireUser(req) }));

const mockRequireFullAccess = vi.fn();
vi.mock("@/server/onboarding/service", () => ({
  requireFullAccess: (user: unknown) => mockRequireFullAccess(user),
}));

const mockCancelMyOrder = vi.fn();
vi.mock("@/server/orders/service", () => ({
  cancelMyOrder: (userId: unknown, orderId: unknown, meta: unknown) => mockCancelMyOrder(userId, orderId, meta),
}));

import { POST } from "./route";

const USER = { id: "u1" };
const ORDER_ID = "11111111-1111-1111-8111-111111111111";

function makeRequest() {
  return new Request(`http://localhost/api/v1/trade/orders/${ORDER_ID}/cancel`, { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/trade/orders/{id}/cancel", () => {
  it("returns 401 when not signed in", async () => {
    mockRequireUser.mockRejectedValueOnce(new AppError("UNAUTHENTICATED", "Sign-in required"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: ORDER_ID }) });

    expect(res.status).toBe(401);
    expect(mockCancelMyOrder).not.toHaveBeenCalled();
  });

  it("returns 404 for an order that doesn't exist or belongs to another learner - never 403", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockCancelMyOrder.mockRejectedValueOnce(new AppError("NOT_FOUND", "No order with this id"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: ORDER_ID }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 ORDER_NOT_CANCELLABLE for an already-filled order", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockCancelMyOrder.mockRejectedValueOnce(
      new AppError("ORDER_NOT_CANCELLABLE", "Cannot cancel an order that is already filled", { status: "filled" }),
    );

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: ORDER_ID }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ORDER_NOT_CANCELLABLE");
  });

  it("cancels the caller's own order and passes the authenticated userId through, not a client-supplied one", async () => {
    mockRequireUser.mockResolvedValueOnce(USER);
    mockRequireFullAccess.mockResolvedValueOnce(undefined);
    mockCancelMyOrder.mockResolvedValueOnce({ id: ORDER_ID, symbol: "RELIANCE", status: "cancelled" });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: ORDER_ID }) });

    expect(res.status).toBe(200);
    expect(mockCancelMyOrder).toHaveBeenCalledWith("u1", ORDER_ID, expect.any(Object));
    const body = await res.json();
    expect(body.data.status).toBe("cancelled");
  });
});
