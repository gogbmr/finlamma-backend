import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCursor } from "@/lib/http";

const mockSumVmoneyBalance = vi.fn();
vi.mock("@/server/economy/repo", () => ({
  sumVmoneyBalance: (userId: unknown) => mockSumVmoneyBalance(userId),
}));

const mockGetCachedQuote = vi.fn();
vi.mock("@/server/market/cache", () => ({
  getCachedQuote: (symbol: unknown, exchange: unknown) => mockGetCachedQuote(symbol, exchange),
}));

const mockListOpenPositions = vi.fn();
const mockListFilledOrdersChronological = vi.fn();
const mockSumBuyCostBasisPaise = vi.fn();
const mockSumRealizedPnlPaise = vi.fn();
const mockListClosedTradesForStats = vi.fn();
const mockCountOpenPositions = vi.fn();
const mockListClosedTradesPage = vi.fn();
vi.mock("./repo", () => ({
  listOpenPositions: (userId: unknown) => mockListOpenPositions(userId),
  listFilledOrdersChronological: (userId: unknown) => mockListFilledOrdersChronological(userId),
  sumBuyCostBasisPaise: (userId: unknown) => mockSumBuyCostBasisPaise(userId),
  sumRealizedPnlPaise: (userId: unknown) => mockSumRealizedPnlPaise(userId),
  listClosedTradesForStats: (userId: unknown) => mockListClosedTradesForStats(userId),
  countOpenPositions: (userId: unknown) => mockCountOpenPositions(userId),
  listClosedTradesPage: (userId: unknown, opts: unknown) => mockListClosedTradesPage(userId, opts),
}));

const { buildEquityCurve, getPortfolioSummary, getPortfolioStats, getPortfolioTrades } = await import("./service");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildEquityCurve (pure)", () => {
  it("returns an empty array when nothing has ever filled", () => {
    expect(buildEquityCurve([], new Map())).toEqual([]);
  });

  it("replays a single BUY: equity = -cost + qty * live price", () => {
    const orders = [{ side: "buy" as const, qty: 2, fillPricePaise: 10000, symbol: "AAA", filledAt: new Date() }];
    const bars = buildEquityCurve(orders, new Map([["AAA", 12000]]));
    // cashFlow = -20000, held 2 @ live 12000 = 24000, equity = 4000
    expect(bars).toEqual([4000]);
  });

  it("uses last-fill price (not live) for a symbol with no live quote available", () => {
    const orders = [{ side: "buy" as const, qty: 1, fillPricePaise: 10000, symbol: "AAA", filledAt: new Date() }];
    const bars = buildEquityCurve(orders, new Map());
    // no live price -> falls back to the fill price itself: -10000 + 10000 = 0
    expect(bars).toEqual([0]);
  });

  it("a full round trip (buy then sell all) nets to the realized cash flow, holding nothing", () => {
    const orders = [
      { side: "buy" as const, qty: 2, fillPricePaise: 10000, symbol: "AAA", filledAt: new Date(0) },
      { side: "sell" as const, qty: 2, fillPricePaise: 15000, symbol: "AAA", filledAt: new Date(1) },
    ];
    const bars = buildEquityCurve(orders, new Map());
    // point 1: -20000 + 2*10000(last fill) = 0; point 2: -20000+30000 = 10000, nothing held
    expect(bars).toEqual([0, 10000]);
  });

  it("downsamples to at most maxBars points, evenly spaced, when there are more fills than that", () => {
    const orders = Array.from({ length: 20 }, (_, i) => ({
      side: "buy" as const,
      qty: 1,
      fillPricePaise: 1000 * (i + 1),
      symbol: "AAA",
      filledAt: new Date(i),
    }));
    const bars = buildEquityCurve(orders, new Map(), 5);
    expect(bars).toHaveLength(5);
  });
});

describe("getPortfolioSummary", () => {
  it("combines cash, holdings market value and the equity curve", async () => {
    mockSumVmoneyBalance.mockResolvedValueOnce(84000);
    mockListOpenPositions.mockResolvedValueOnce([
      { symbol: "AAA", exchange: "NSE", qty: 2, avgPricePaise: 10000, positionOpenedAt: new Date() },
    ]);
    mockListFilledOrdersChronological.mockResolvedValueOnce([
      { side: "buy", qty: 2, fillPricePaise: 10000, symbol: "AAA", filledAt: new Date() },
    ]);
    mockSumBuyCostBasisPaise.mockResolvedValueOnce(20000);
    mockSumRealizedPnlPaise.mockResolvedValueOnce(0);
    mockGetCachedQuote.mockResolvedValueOnce({ pricePaise: 12000 });

    const result = await getPortfolioSummary("u1");

    expect(result.cashBalancePaise).toBe(84000);
    expect(result.holdingsMarketValuePaise).toBe(24000);
    expect(result.totalValuePaise).toBe(108000);
    expect(result.allTimePnlPaise).toBe(4000); // unrealized 2*(12000-10000)
    expect(result.allTimePnlPct).toBe(20); // 4000/20000*100
    expect(result.equityBarsPaise).toEqual([4000]);
  });

  it("treats a failed/missing quote as no market value for that position, not an error", async () => {
    mockSumVmoneyBalance.mockResolvedValueOnce(0);
    mockListOpenPositions.mockResolvedValueOnce([
      { symbol: "AAA", exchange: "NSE", qty: 2, avgPricePaise: 10000, positionOpenedAt: new Date() },
    ]);
    mockListFilledOrdersChronological.mockResolvedValueOnce([]);
    mockSumBuyCostBasisPaise.mockResolvedValueOnce(0);
    mockSumRealizedPnlPaise.mockResolvedValueOnce(0);
    mockGetCachedQuote.mockRejectedValueOnce(new Error("vendor down"));

    const result = await getPortfolioSummary("u1");

    expect(result.holdingsMarketValuePaise).toBe(0);
    expect(result.allTimePnlPaise).toBe(0);
    expect(result.allTimePnlPct).toBe(0);
  });
});

describe("getPortfolioStats", () => {
  it("computes win rate, avg hold and best/worst from closed trades", async () => {
    mockListClosedTradesForStats.mockResolvedValueOnce([
      { symbol: "AAA", realizedPnlPaise: 5000, filledAt: new Date("2026-01-10T00:00:00Z"), holdDays: 2 },
      { symbol: "BBB", realizedPnlPaise: -2000, filledAt: new Date("2026-01-12T00:00:00Z"), holdDays: 4 },
    ]);
    mockCountOpenPositions.mockResolvedValueOnce(3);
    mockSumRealizedPnlPaise.mockResolvedValueOnce(3000);

    const result = await getPortfolioStats("u1");

    expect(result).toMatchObject({
      totalClosedTrades: 2,
      realizedPnlPaise: 3000,
      winCount: 1,
      lossCount: 1,
      winRatePct: 50,
      avgHoldDays: 3,
      openPositionsCount: 3,
    });
    expect(result.bestTrade).toMatchObject({ symbol: "AAA", realizedPnlPaise: 5000 });
    expect(result.worstTrade).toMatchObject({ symbol: "BBB", realizedPnlPaise: -2000 });
  });

  it("returns null best/worst/avgHoldDays and 0 win rate when nothing has ever closed", async () => {
    mockListClosedTradesForStats.mockResolvedValueOnce([]);
    mockCountOpenPositions.mockResolvedValueOnce(0);
    mockSumRealizedPnlPaise.mockResolvedValueOnce(0);

    const result = await getPortfolioStats("u1");

    expect(result).toMatchObject({ totalClosedTrades: 0, winRatePct: 0, avgHoldDays: null, bestTrade: null, worstTrade: null });
  });
});

describe("getPortfolioTrades", () => {
  it("status=all with no cursor includes open positions and the first page of closed trades", async () => {
    mockListOpenPositions.mockResolvedValueOnce([
      { symbol: "AAA", exchange: "NSE", qty: 1, avgPricePaise: 10000, positionOpenedAt: new Date() },
    ]);
    mockGetCachedQuote.mockResolvedValueOnce({ pricePaise: 11000 });
    mockListClosedTradesPage.mockResolvedValueOnce({
      data: [
        {
          id: "o1",
          symbol: "BBB",
          exchange: "NSE",
          qty: 1,
          fillPricePaise: 15000,
          realizedPnlPaise: 5000,
          filledAt: new Date("2026-01-10T00:00:00Z"),
          positionOpenedAt: new Date("2026-01-08T00:00:00Z"),
        },
      ],
      nextCursor: "next",
    });

    const result = await getPortfolioTrades("u1", { status: "all", limit: 20, cursor: null });

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ kind: "open", symbol: "AAA" });
    expect(result.data[1]).toMatchObject({ kind: "closed", symbol: "BBB", realizedPnlPaise: 5000 });
    expect(result.nextCursor).toBe("next");
  });

  it("status=all WITH a cursor omits open positions - they only ever appear on the first page", async () => {
    mockListClosedTradesPage.mockResolvedValueOnce({ data: [], nextCursor: null });
    const cursor = encodeCursor({ filledAt: new Date().toISOString(), id: "o0" });

    const result = await getPortfolioTrades("u1", { status: "all", limit: 20, cursor });

    expect(mockListOpenPositions).not.toHaveBeenCalled();
    expect(result.data).toEqual([]);
  });

  it("status=open never calls the closed-trades repo function", async () => {
    mockListOpenPositions.mockResolvedValueOnce([]);

    await getPortfolioTrades("u1", { status: "open", limit: 20, cursor: null });

    expect(mockListClosedTradesPage).not.toHaveBeenCalled();
  });

  it("status=closed never calls the open-positions repo function", async () => {
    mockListClosedTradesPage.mockResolvedValueOnce({ data: [], nextCursor: null });

    await getPortfolioTrades("u1", { status: "closed", limit: 20, cursor: null });

    expect(mockListOpenPositions).not.toHaveBeenCalled();
  });

  it("shapes a closed row's entry/exit price and P&L% from realizedPnlPaise", async () => {
    mockListClosedTradesPage.mockResolvedValueOnce({
      data: [
        {
          id: "o1",
          symbol: "BBB",
          exchange: "NSE",
          qty: 2,
          fillPricePaise: 15000,
          realizedPnlPaise: 10000, // entry = 15000 - 10000/2 = 10000
          filledAt: new Date("2026-01-10T00:00:00Z"),
          positionOpenedAt: new Date("2026-01-08T00:00:00Z"),
        },
      ],
      nextCursor: null,
    });

    const result = await getPortfolioTrades("u1", { status: "closed", limit: 20, cursor: null });

    expect(result.data[0]).toMatchObject({
      kind: "closed",
      entryPricePaise: 10000,
      exitPricePaise: 15000,
      realizedPnlPaise: 10000,
      realizedPnlPct: 50, // 10000 / (10000*2) * 100
      holdDays: 2,
    });
  });
});
