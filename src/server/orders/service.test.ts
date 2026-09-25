import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetInstrumentBySymbol = vi.fn();
vi.mock("@/server/trading/repo", () => ({
  getInstrumentBySymbol: (symbol: unknown) => mockGetInstrumentBySymbol(symbol),
}));

const mockIsTradingUnlocked = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  isTradingUnlocked: (userId: unknown) => mockIsTradingUnlocked(userId),
}));

const mockPlaceOrderTx = vi.fn();
vi.mock("./repo", () => ({
  placeOrderTx: (
    userId: unknown,
    instrument: unknown,
    input: unknown,
    idempotencyKey: unknown,
  ) => mockPlaceOrderTx(userId, instrument, input, idempotencyKey),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const { placeOrder } = await import("./service");

const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const INSTRUMENT = { id: "inst_1", symbol: "RELIANCE", exchange: "NSE", active: true, halted: false };
const INPUT = { symbol: "RELIANCE", side: "buy" as const, type: "market" as const, qty: 1 };

function orderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order_1",
    side: "buy",
    type: "market",
    qty: 1,
    limitPricePaise: null,
    status: "filled",
    fillPricePaise: 10000,
    createdAt: new Date("2026-09-21T05:00:00.000Z"),
    filledAt: new Date("2026-09-21T05:00:00.000Z"),
    cancelledAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetInstrumentBySymbol.mockResolvedValue(INSTRUMENT);
  mockIsTradingUnlocked.mockResolvedValue(true);
});

describe("placeOrder - pre-checks", () => {
  it("throws NOT_FOUND for an unknown symbol, never reaching placeOrderTx", async () => {
    mockGetInstrumentBySymbol.mockResolvedValueOnce(null);

    await expect(placeOrder(USER, INPUT, "key1", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPlaceOrderTx).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an inactive instrument", async () => {
    mockGetInstrumentBySymbol.mockResolvedValueOnce({ ...INSTRUMENT, active: false });

    await expect(placeOrder(USER, INPUT, "key1", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN when trading isn't unlocked, never reaching placeOrderTx", async () => {
    mockIsTradingUnlocked.mockResolvedValueOnce(false);

    await expect(placeOrder(USER, INPUT, "key1", META)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockPlaceOrderTx).not.toHaveBeenCalled();
  });
});

describe("placeOrder - status-to-error mapping", () => {
  const cases: [string, string][] = [
    ["idempotency_conflict", "IDEMPOTENCY_REPLAY"],
    ["market_halted", "MARKET_HALTED"],
    ["symbol_halted", "SYMBOL_HALTED"],
    ["market_paused", "MARKET_PAUSED"],
    ["market_closed", "MARKET_CLOSED"],
    ["price_unavailable", "PRICE_UNAVAILABLE"],
    ["price_stale", "PRICE_STALE"],
  ];

  it.each(cases)("maps repo status %s to AppError code %s", async (status, code) => {
    mockPlaceOrderTx.mockResolvedValueOnce({ status });

    await expect(placeOrder(USER, INPUT, "key1", META)).rejects.toMatchObject({ code });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("maps insufficient_margin with the exact shortfall in details", async () => {
    mockPlaceOrderTx.mockResolvedValueOnce({ status: "insufficient_margin", balancePaise: 5000, requiredPaise: 10000 });

    await expect(placeOrder(USER, INPUT, "key1", META)).rejects.toMatchObject({
      code: "INSUFFICIENT_MARGIN",
      details: { balancePaise: 5000, requiredPaise: 10000 },
    });
  });

  it("maps insufficient_holdings with the exact shortfall in details", async () => {
    mockPlaceOrderTx.mockResolvedValueOnce({ status: "insufficient_holdings", heldQty: 0, requestedQty: 1 });

    await expect(placeOrder(USER, INPUT, "key1", META)).rejects.toMatchObject({
      code: "INSUFFICIENT_HOLDINGS",
      details: { heldQty: 0, requestedQty: 1 },
    });
  });
});

describe("placeOrder - success paths", () => {
  it("shapes a filled order and logs order.filled", async () => {
    mockPlaceOrderTx.mockResolvedValueOnce({ status: "filled", order: orderRow() });

    const result = await placeOrder(USER, INPUT, "key1", META);

    expect(result).toMatchObject({ id: "order_1", symbol: "RELIANCE", status: "filled", replayed: false });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "order.filled", targetId: "order_1" }),
    );
  });

  it("shapes a queued order and logs order.queued", async () => {
    mockPlaceOrderTx.mockResolvedValueOnce({
      status: "queued",
      order: orderRow({ status: "open", fillPricePaise: null, filledAt: null }),
    });

    const result = await placeOrder(USER, { ...INPUT, type: "limit", limitPricePaise: 5000 }, "key1", META);

    expect(result).toMatchObject({ status: "open", replayed: false });
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "order.queued" }));
  });

  it("shapes a replayed order and does NOT log activity again", async () => {
    mockPlaceOrderTx.mockResolvedValueOnce({ status: "replayed", order: orderRow() });

    const result = await placeOrder(USER, INPUT, "key1", META);

    expect(result).toMatchObject({ id: "order_1", replayed: true });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("passes the instrument and idempotency key straight through to placeOrderTx", async () => {
    mockPlaceOrderTx.mockResolvedValueOnce({ status: "filled", order: orderRow() });

    await placeOrder(USER, INPUT, "my-key", META);

    expect(mockPlaceOrderTx).toHaveBeenCalledWith(USER.id, INSTRUMENT, INPUT, "my-key");
  });
});
