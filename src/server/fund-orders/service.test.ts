import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFundByIdInternal = vi.fn();
vi.mock("@/server/funds/repo", () => ({
  getFundByIdInternal: (id: unknown) => mockGetFundByIdInternal(id),
}));

const mockIsTradingUnlocked = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  isTradingUnlocked: (userId: unknown) => mockIsTradingUnlocked(userId),
}));

const mockPlaceFundOrderTx = vi.fn();
vi.mock("./repo", () => ({
  placeFundOrderTx: (userId: unknown, fund: unknown, input: unknown, idempotencyKey: unknown) =>
    mockPlaceFundOrderTx(userId, fund, input, idempotencyKey),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const { placeFundOrder } = await import("./service");

const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const FUND = { id: "fund_1", active: true, minLumpSumPaise: 10000, minSipPaise: 10000 };
const BUY_INPUT = { fundId: "fund_1", side: "buy" as const, amountPaise: 50000 };

function orderRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order_1",
    fundId: "fund_1",
    side: "buy",
    status: "filled",
    amountPaise: 50000,
    unitsMilli: 5000,
    navPaise: 10000,
    navDate: "2026-09-25",
    realizedPnlPaise: null,
    createdAt: new Date("2026-09-25T05:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetFundByIdInternal.mockResolvedValue(FUND);
  mockIsTradingUnlocked.mockResolvedValue(true);
});

describe("placeFundOrder - pre-checks", () => {
  it("throws NOT_FOUND for an unknown fund id, never reaching placeFundOrderTx", async () => {
    mockGetFundByIdInternal.mockResolvedValueOnce(null);

    await expect(placeFundOrder(USER, BUY_INPUT, "key1", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockPlaceFundOrderTx).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an inactive fund", async () => {
    mockGetFundByIdInternal.mockResolvedValueOnce({ ...FUND, active: false });

    await expect(placeFundOrder(USER, BUY_INPUT, "key1", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN when trading isn't unlocked, never reaching placeFundOrderTx", async () => {
    mockIsTradingUnlocked.mockResolvedValueOnce(false);

    await expect(placeFundOrder(USER, BUY_INPUT, "key1", META)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockPlaceFundOrderTx).not.toHaveBeenCalled();
  });

  it("throws VALIDATION_FAILED for a BUY below the fund's minimum lump sum", async () => {
    mockGetFundByIdInternal.mockResolvedValueOnce({ ...FUND, minLumpSumPaise: 100000 });

    await expect(placeFundOrder(USER, BUY_INPUT, "key1", META)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockPlaceFundOrderTx).not.toHaveBeenCalled();
  });
});

describe("placeFundOrder - status-to-error mapping", () => {
  const cases: [string, string][] = [
    ["idempotency_conflict", "IDEMPOTENCY_REPLAY"],
    ["nav_unavailable", "NAV_UNAVAILABLE"],
    ["nav_stale", "NAV_STALE"],
  ];

  it.each(cases)("maps repo status %s to AppError code %s", async (status, code) => {
    mockPlaceFundOrderTx.mockResolvedValueOnce({ status });

    await expect(placeFundOrder(USER, BUY_INPUT, "key1", META)).rejects.toMatchObject({ code });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("maps insufficient_margin with the exact shortfall in details", async () => {
    mockPlaceFundOrderTx.mockResolvedValueOnce({ status: "insufficient_margin", balancePaise: 5000, requiredPaise: 50000 });

    await expect(placeFundOrder(USER, BUY_INPUT, "key1", META)).rejects.toMatchObject({
      code: "INSUFFICIENT_MARGIN",
      details: { balancePaise: 5000, requiredPaise: 50000 },
    });
  });

  it("maps insufficient_holdings with the exact shortfall in details", async () => {
    mockPlaceFundOrderTx.mockResolvedValueOnce({ status: "insufficient_holdings", heldUnitsMilli: 0, requestedUnitsMilli: 1000 });

    await expect(
      placeFundOrder(USER, { fundId: "fund_1", side: "sell", unitsMilli: 1000 }, "key1", META),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_HOLDINGS",
      details: { heldUnitsMilli: 0, requestedUnitsMilli: 1000 },
    });
  });
});

describe("placeFundOrder - success paths", () => {
  it("shapes a filled order and logs fund_order.filled", async () => {
    mockPlaceFundOrderTx.mockResolvedValueOnce({ status: "filled", order: orderRow() });

    const result = await placeFundOrder(USER, BUY_INPUT, "key1", META);

    expect(result).toMatchObject({ id: "order_1", fundId: "fund_1", status: "filled", replayed: false });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "fund_order.filled", targetId: "order_1" }),
    );
  });

  it("shapes a replayed order and does NOT log activity again", async () => {
    mockPlaceFundOrderTx.mockResolvedValueOnce({ status: "replayed", order: orderRow() });

    const result = await placeFundOrder(USER, BUY_INPUT, "key1", META);

    expect(result).toMatchObject({ id: "order_1", replayed: true });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
