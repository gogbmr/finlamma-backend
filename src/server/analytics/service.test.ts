import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetOrSetJsonCache = vi.fn(async (_key: string, _ttl: number, compute: () => unknown) => compute());
vi.mock("@/lib/redis", () => ({
  getOrSetJsonCache: (...args: Parameters<typeof mockGetOrSetJsonCache>) => mockGetOrSetJsonCache(...args),
}));

const mockCountActiveTradersToday = vi.fn();
const mockCountOrdersToday = vi.fn();
vi.mock("@/server/ops/repo", () => ({
  countActiveTradersToday: (...args: unknown[]) => mockCountActiveTradersToday(...args),
  countOrdersToday: (...args: unknown[]) => mockCountOrdersToday(...args),
}));

const mockGetPulseCheckEngagement = vi.fn();
vi.mock("@/server/pulse-check/service", () => ({
  getPulseCheckEngagement: (...args: unknown[]) => mockGetPulseCheckEngagement(...args),
}));

const mockCountStuckAccountDeletionsOlderThan = vi.fn();
vi.mock("@/server/users/repo", () => ({
  countStuckAccountDeletionsOlderThan: (...args: unknown[]) => mockCountStuckAccountDeletionsOlderThan(...args),
}));

const mockCountTotalActiveUsers = vi.fn();
const mockCountNewUsersSince = vi.fn();
const mockCountDistinctActiveUsersSinceIstDate = vi.fn();
const mockCountLessonsCompletedSince = vi.fn();
const mockCountActiveAdFreeEntitlements = vi.fn();
const mockListEntitlementUpdateEventTypesSince = vi.fn();
vi.mock("./repo", () => ({
  countTotalActiveUsers: () => mockCountTotalActiveUsers(),
  countNewUsersSince: (...args: unknown[]) => mockCountNewUsersSince(...args),
  countDistinctActiveUsersSinceIstDate: (...args: unknown[]) => mockCountDistinctActiveUsersSinceIstDate(...args),
  countLessonsCompletedSince: (...args: unknown[]) => mockCountLessonsCompletedSince(...args),
  countActiveAdFreeEntitlements: (...args: unknown[]) => mockCountActiveAdFreeEntitlements(...args),
  listEntitlementUpdateEventTypesSince: (...args: unknown[]) => mockListEntitlementUpdateEventTypesSince(...args),
}));

const { getAdminAnalyticsSummary } = await import("./service");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOrSetJsonCache.mockImplementation(async (_key, _ttl, compute: () => unknown) => compute());
  mockCountTotalActiveUsers.mockResolvedValue(500);
  mockCountNewUsersSince.mockResolvedValue(10);
  mockCountDistinctActiveUsersSinceIstDate.mockResolvedValue(50);
  mockCountLessonsCompletedSince.mockResolvedValue(20);
  mockCountActiveTradersToday.mockResolvedValue(5);
  mockCountOrdersToday.mockResolvedValue(8);
  mockGetPulseCheckEngagement.mockResolvedValue({ daily: [], averagePct: 42, activeUserCount: 100 });
  mockCountActiveAdFreeEntitlements.mockResolvedValue(3);
  mockListEntitlementUpdateEventTypesSince.mockResolvedValue([]);
  mockCountStuckAccountDeletionsOlderThan.mockResolvedValue(0);
});

describe("getAdminAnalyticsSummary", () => {
  it("is cached via getOrSetJsonCache under a stable key", async () => {
    await getAdminAnalyticsSummary();

    expect(mockGetOrSetJsonCache).toHaveBeenCalledWith(
      "analytics:admin-summary",
      expect.any(Number),
      expect.any(Function),
    );
  });

  it("assembles every domain's tiles from the underlying bounded aggregates", async () => {
    const summary = await getAdminAnalyticsSummary();

    expect(summary.users).toEqual({
      totalActive: 500,
      newToday: 10,
      newLast7Days: 10,
      accountDeletionsPendingOver24h: 0,
      accountDeletionsStuckOver3Days: 0,
    });
    expect(summary.retention).toEqual({ dau: 50, wau: 50, mau: 50 });
    expect(summary.lessons).toEqual({ completedToday: 20, completedLast7Days: 20 });
    expect(summary.trading).toEqual({ activeTradersToday: 5, ordersToday: 8 });
    expect(summary.news).toEqual({ pulseCheckEngagementPct7Day: 42, pulseCheckActiveUsers: 100 });
    expect(summary.revenue.activeAdFreeEntitlements).toBe(3);
  });

  it("counts only genuine new-purchase event types toward revenue, never renewals/cancellations", async () => {
    mockListEntitlementUpdateEventTypesSince.mockResolvedValueOnce([
      "INITIAL_PURCHASE",
      "RENEWAL",
      "NON_RENEWING_PURCHASE",
      "CANCELLATION",
      "EXPIRATION",
      "INITIAL_PURCHASE",
    ]);

    const summary = await getAdminAnalyticsSummary();

    expect(summary.revenue.newPurchasesLast7Days).toBe(3);
  });

  it("reports the 24h-pending and 3-day-stuck account-deletion counts separately", async () => {
    mockCountStuckAccountDeletionsOlderThan.mockResolvedValueOnce(4); // 24h cutoff
    mockCountStuckAccountDeletionsOlderThan.mockResolvedValueOnce(1); // 3-day cutoff

    const summary = await getAdminAnalyticsSummary();

    expect(summary.users.accountDeletionsPendingOver24h).toBe(4);
    expect(summary.users.accountDeletionsStuckOver3Days).toBe(1);
    expect(mockCountStuckAccountDeletionsOlderThan).toHaveBeenCalledTimes(2);
  });

  it("never returns anything shaped like a per-user identifier - aggregate counts only", async () => {
    const summary = await getAdminAnalyticsSummary();

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/userId|email|firstName|lastInitial/i);
  });
});
