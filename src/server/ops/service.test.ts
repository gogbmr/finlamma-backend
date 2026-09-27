import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RISK_THRESHOLDS } from "./schemas";

const mockGetSettingJson = vi.fn();
const mockSetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingJson: (key: unknown) => mockGetSettingJson(key),
  setSettingJson: (key: unknown, value: unknown, description: unknown) => mockSetSettingJson(key, value, description),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({ logActivity: (input: unknown) => mockLogActivity(input) }));

const mockGetOrSetJsonCache = vi.fn(async (_key: string, _ttl: number, compute: () => unknown) => compute());
vi.mock("@/lib/redis", () => ({ getOrSetJsonCache: (...args: Parameters<typeof mockGetOrSetJsonCache>) => mockGetOrSetJsonCache(...args) }));

const mockGetCachedQuote = vi.fn();
vi.mock("@/server/market/cache", () => ({ getCachedQuote: (...args: unknown[]) => mockGetCachedQuote(...args) }));

const mockGetLatestNav = vi.fn();
vi.mock("@/server/funds/repo", () => ({ getLatestNav: (...args: unknown[]) => mockGetLatestNav(...args) }));

const mockGetInstrumentsByIds = vi.fn();
vi.mock("@/server/trading/repo", () => ({ getInstrumentsByIds: (...args: unknown[]) => mockGetInstrumentsByIds(...args) }));

const mockCountActiveTradersToday = vi.fn();
const mockCountOrdersToday = vi.fn();
const mockCountOrdersTodayForUsers = vi.fn();
const mockGetUsersByIds = vi.fn();
const mockListHoldingsForUsers = vi.fn();
const mockListRecentOpsEvents = vi.fn();
const mockListTradingActiveUserIdsSorted = vi.fn();
const mockSumRealizedPnlForUsers = vi.fn();
const mockSumVmoneyBalancesForUsers = vi.fn();
const mockSumVmoneyInPlay = vi.fn();
vi.mock("./repo", () => ({
  countActiveTradersToday: (...args: unknown[]) => mockCountActiveTradersToday(...args),
  countOrdersToday: (...args: unknown[]) => mockCountOrdersToday(...args),
  countOrdersTodayForUsers: (...args: unknown[]) => mockCountOrdersTodayForUsers(...args),
  getUsersByIds: (...args: unknown[]) => mockGetUsersByIds(...args),
  listHoldingsForUsers: (...args: unknown[]) => mockListHoldingsForUsers(...args),
  listRecentOpsEvents: (...args: unknown[]) => mockListRecentOpsEvents(...args),
  listTradingActiveUserIdsSorted: (...args: unknown[]) => mockListTradingActiveUserIdsSorted(...args),
  sumRealizedPnlForUsers: (...args: unknown[]) => mockSumRealizedPnlForUsers(...args),
  sumVmoneyBalancesForUsers: (...args: unknown[]) => mockSumVmoneyBalancesForUsers(...args),
  sumVmoneyInPlay: (...args: unknown[]) => mockSumVmoneyInPlay(...args),
}));

const {
  computeRiskFlag,
  getOpsKpis,
  getRecentOpsEvents,
  getRiskThresholds,
  getUserTradingLedgerPage,
  updateRiskThresholds,
} = await import("./service");

const ACTOR = { id: "staff_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOrSetJsonCache.mockImplementation(async (_key, _ttl, compute) => compute());
  mockListHoldingsForUsers.mockResolvedValue({ stock: [], fund: [] });
  mockGetInstrumentsByIds.mockResolvedValue([]);
  mockSumRealizedPnlForUsers.mockResolvedValue(new Map());
  mockSumVmoneyBalancesForUsers.mockResolvedValue(new Map());
  mockCountOrdersTodayForUsers.mockResolvedValue(new Map());
  mockGetUsersByIds.mockResolvedValue([]);
});

describe("computeRiskFlag (pure)", () => {
  it("flags NEW when the account is younger than the threshold, regardless of other numbers", () => {
    expect(computeRiskFlag(3, 100, 50, DEFAULT_RISK_THRESHOLDS)).toBe("new");
  });

  it("flags WATCH for over-concentration once past the NEW window", () => {
    expect(computeRiskFlag(30, 51, 0, DEFAULT_RISK_THRESHOLDS)).toBe("watch");
  });

  it("flags WATCH for order-count over the threshold once past the NEW window", () => {
    expect(computeRiskFlag(30, 0, 11, DEFAULT_RISK_THRESHOLDS)).toBe("watch");
  });

  it("flags OK when nothing crosses a threshold", () => {
    expect(computeRiskFlag(30, 50, 10, DEFAULT_RISK_THRESHOLDS)).toBe("ok");
  });

  it("respects admin-edited thresholds, not hardcoded defaults", () => {
    // Under the DEFAULT thresholds, a 5-day-old account is NEW (< 7 days).
    expect(computeRiskFlag(5, 20, 2, DEFAULT_RISK_THRESHOLDS)).toBe("new");
    // Under a custom, narrower NEW window (1 day), that same 5-day-old
    // account - with concentration/orders comfortably under the custom
    // WATCH bars too - is OK instead.
    const custom = { newAccountDays: 1, concentrationPct: 90, dailyOrderCount: 100 };
    expect(computeRiskFlag(5, 20, 2, custom)).toBe("ok");
  });
});

describe("getRiskThresholds / updateRiskThresholds", () => {
  it("falls back to defaults when nothing is seeded", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);
    expect(await getRiskThresholds()).toEqual(DEFAULT_RISK_THRESHOLDS);
  });

  it("falls back to defaults when the stored shape doesn't validate", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ garbage: true });
    expect(await getRiskThresholds()).toEqual(DEFAULT_RISK_THRESHOLDS);
  });

  it("updates the setting and logs ops.risk_thresholds_updated", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_RISK_THRESHOLDS);
    const next = { newAccountDays: 5, concentrationPct: 60, dailyOrderCount: 15 };

    const result = await updateRiskThresholds(ACTOR, next, META);

    expect(result).toEqual(next);
    expect(mockSetSettingJson).toHaveBeenCalledWith("trading_risk_thresholds", next, expect.any(String));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ops.risk_thresholds_updated", metadata: { previous: DEFAULT_RISK_THRESHOLDS, next } }),
    );
  });
});

describe("getUserTradingLedgerPage", () => {
  it("returns an empty page and skips logging when there are no trading-active users", async () => {
    mockListTradingActiveUserIdsSorted.mockResolvedValueOnce([]);
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_RISK_THRESHOLDS);

    const result = await getUserTradingLedgerPage(ACTOR, {}, META);

    expect(result).toEqual({ data: [], nextCursor: null });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("logs ops.user_ledger_viewed with exactly the viewed user ids", async () => {
    mockListTradingActiveUserIdsSorted.mockResolvedValueOnce(["u1", "u2"]);
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_RISK_THRESHOLDS);
    mockGetUsersByIds.mockResolvedValueOnce([
      { id: "u1", firstName: "Aarav", lastInitial: "S", createdAt: new Date("2020-01-01T00:00:00Z") },
      { id: "u2", firstName: "Diya", lastInitial: "K", createdAt: new Date("2020-01-01T00:00:00Z") },
    ]);

    await getUserTradingLedgerPage(ACTOR, { limit: 20 }, META);

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ops.user_ledger_viewed",
        targetType: "trading_ledger",
        metadata: { viewedUserIds: ["u1", "u2"], count: 2 },
      }),
    );
  });

  it("paginates via cursor (last seen userId) and reports nextCursor only when more remain", async () => {
    mockListTradingActiveUserIdsSorted.mockResolvedValue(["u1", "u2", "u3"]);
    mockGetSettingJson.mockResolvedValue(DEFAULT_RISK_THRESHOLDS);
    mockGetUsersByIds.mockResolvedValue([]);

    const firstPage = await getUserTradingLedgerPage(ACTOR, { limit: 2 }, META);
    expect(firstPage.nextCursor).toBe("u2");

    const secondPage = await getUserTradingLedgerPage(ACTOR, { limit: 2, cursor: "u2" }, META);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("does not show more identity than balance/P&L/concentration/orders/flag need - no email, DOB or parent contact fields", async () => {
    mockListTradingActiveUserIdsSorted.mockResolvedValueOnce(["u1"]);
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_RISK_THRESHOLDS);
    mockGetUsersByIds.mockResolvedValueOnce([
      { id: "u1", firstName: "Aarav", lastInitial: "S", createdAt: new Date("2020-01-01T00:00:00Z") },
    ]);

    const { data } = await getUserTradingLedgerPage(ACTOR, {}, META);

    expect(Object.keys(data[0]!).sort()).toEqual(
      ["balancePaise", "concentrationPct", "displayName", "flag", "joinedAt", "ordersToday", "totalPnlPaise", "userId"].sort(),
    );
  });
});

describe("getOpsKpis", () => {
  it("computes riskFlagsCount using the full trading-active population, not just one page", async () => {
    mockCountActiveTradersToday.mockResolvedValueOnce(5);
    mockCountOrdersToday.mockResolvedValueOnce(12);
    mockListTradingActiveUserIdsSorted.mockResolvedValueOnce(["u1", "u2"]);
    mockGetSettingJson.mockResolvedValue(DEFAULT_RISK_THRESHOLDS);
    mockSumVmoneyInPlay.mockResolvedValueOnce(500000);
    mockGetUsersByIds.mockResolvedValueOnce([
      { id: "u1", firstName: "A", lastInitial: "A", createdAt: new Date("2020-01-01T00:00:00Z") },
      { id: "u2", firstName: "B", lastInitial: "B", createdAt: new Date() }, // joined today -> NEW
    ]);

    const kpis = await getOpsKpis();

    expect(kpis).toEqual({
      activeTradersToday: 5,
      ordersToday: 12,
      vmoneyInPlayPaise: 500000,
      riskFlagsCount: 1, // only u2 (NEW)
    });
  });

  it("is cached via getOrSetJsonCache under a stable key", async () => {
    mockListTradingActiveUserIdsSorted.mockResolvedValue([]);
    mockGetSettingJson.mockResolvedValue(DEFAULT_RISK_THRESHOLDS);
    mockSumVmoneyInPlay.mockResolvedValue(0);
    mockCountActiveTradersToday.mockResolvedValue(0);
    mockCountOrdersToday.mockResolvedValue(0);

    await getOpsKpis();

    expect(mockGetOrSetJsonCache).toHaveBeenCalledWith("ops:kpis", expect.any(Number), expect.any(Function));
  });
});

describe("getRecentOpsEvents", () => {
  it("delegates to listRecentOpsEvents with a bounded limit", async () => {
    mockListRecentOpsEvents.mockResolvedValueOnce([{ id: "log_1" }]);
    const result = await getRecentOpsEvents();
    expect(result).toEqual([{ id: "log_1" }]);
    expect(mockListRecentOpsEvents).toHaveBeenCalledWith(expect.any(Number));
  });
});
