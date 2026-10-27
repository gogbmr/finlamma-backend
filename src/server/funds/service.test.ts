import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListActiveFunds = vi.fn();
const mockGetPublicFundById = vi.fn();
const mockGetLatestNav = vi.fn();
const mockListFundHoldingsForUser = vi.fn();
const mockGetFundHoldingForUser = vi.fn();
vi.mock("./repo", () => ({
  listActiveFunds: () => mockListActiveFunds(),
  getPublicFundById: (id: unknown) => mockGetPublicFundById(id),
  getLatestNav: (fundId: unknown) => mockGetLatestNav(fundId),
  listFundHoldingsForUser: (userId: unknown) => mockListFundHoldingsForUser(userId),
  getFundHoldingForUser: (userId: unknown, fundId: unknown) => mockGetFundHoldingForUser(userId, fundId),
}));

const { listPublicFunds, getPublicFund, getFundFolioSummary } = await import("./service");

const FUND = { id: "fund-1", name: "Finlamma Test Fund", active: true };
const USER_ID = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockListFundHoldingsForUser.mockResolvedValue([]);
  mockGetFundHoldingForUser.mockResolvedValue(null);
});

describe("listPublicFunds", () => {
  it("merges each fund's latest NAV and includes the disclaimer", async () => {
    mockListActiveFunds.mockResolvedValueOnce([FUND]);
    mockGetLatestNav.mockResolvedValueOnce({ navPaise: 16296, date: "2026-09-25" });

    const result = await listPublicFunds(USER_ID);

    expect(result.data).toEqual([
      { ...FUND, latestNav: { navPaise: 16296, date: "2026-09-25" }, heldUnitsMilli: null, holdingValuePaise: null },
    ]);
    expect(result.disclaimer).toContain("V Money");
    expect(result.disclaimerLocalized).toMatchObject({ en: result.disclaimer });
    expect(mockGetLatestNav).toHaveBeenCalledWith("fund-1");
    expect(mockListFundHoldingsForUser).toHaveBeenCalledWith(USER_ID);
  });

  it("returns latestNav: null for a never-ingested fund, not an error", async () => {
    mockListActiveFunds.mockResolvedValueOnce([FUND]);
    mockGetLatestNav.mockResolvedValueOnce(null);

    const result = await listPublicFunds(USER_ID);

    expect(result.data[0]!.latestNav).toBeNull();
  });

  it("merges in the caller's own held units and holding value when they hold the fund", async () => {
    mockListActiveFunds.mockResolvedValueOnce([FUND]);
    mockGetLatestNav.mockResolvedValueOnce({ navPaise: 16296, date: "2026-09-25" });
    mockListFundHoldingsForUser.mockResolvedValueOnce([{ fundId: "fund-1", unitsMilli: 12500, avgNavPaise: 15000 }]);

    const result = await listPublicFunds(USER_ID);

    // 12500 units-milli * 16296 paise / 1000 = 203700 paise
    expect(result.data[0]).toMatchObject({ heldUnitsMilli: 12500, holdingValuePaise: 203700 });
  });

  it("values a held fund at null if it's never been ingested a NAV, rather than fabricating a price", async () => {
    mockListActiveFunds.mockResolvedValueOnce([FUND]);
    mockGetLatestNav.mockResolvedValueOnce(null);
    mockListFundHoldingsForUser.mockResolvedValueOnce([{ fundId: "fund-1", unitsMilli: 12500, avgNavPaise: 15000 }]);

    const result = await listPublicFunds(USER_ID);

    expect(result.data[0]).toMatchObject({ heldUnitsMilli: 12500, holdingValuePaise: null });
  });

  it("treats a zero-unit holding row as not held (null), not 0", async () => {
    mockListActiveFunds.mockResolvedValueOnce([FUND]);
    mockGetLatestNav.mockResolvedValueOnce({ navPaise: 16296, date: "2026-09-25" });
    mockListFundHoldingsForUser.mockResolvedValueOnce([{ fundId: "fund-1", unitsMilli: 0, avgNavPaise: 0 }]);

    const result = await listPublicFunds(USER_ID);

    expect(result.data[0]).toMatchObject({ heldUnitsMilli: null, holdingValuePaise: null });
  });
});

describe("getPublicFund", () => {
  it("throws NOT_FOUND for an unknown fund id", async () => {
    mockGetPublicFundById.mockResolvedValueOnce(null);

    await expect(getPublicFund("nope", USER_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for an inactive fund", async () => {
    mockGetPublicFundById.mockResolvedValueOnce({ ...FUND, active: false });

    await expect(getPublicFund("fund-1", USER_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the fund's detail with its latest NAV", async () => {
    mockGetPublicFundById.mockResolvedValueOnce(FUND);
    mockGetLatestNav.mockResolvedValueOnce({ navPaise: 16296, date: "2026-09-25" });

    const result = await getPublicFund("fund-1", USER_ID);

    expect(result.data).toMatchObject({ id: "fund-1", latestNav: { navPaise: 16296, date: "2026-09-25" } });
    expect(mockGetFundHoldingForUser).toHaveBeenCalledWith(USER_ID, "fund-1");
  });

  it("merges in the caller's own held units and holding value", async () => {
    mockGetPublicFundById.mockResolvedValueOnce(FUND);
    mockGetLatestNav.mockResolvedValueOnce({ navPaise: 16296, date: "2026-09-25" });
    mockGetFundHoldingForUser.mockResolvedValueOnce({ unitsMilli: 12500, avgNavPaise: 15000 });

    const result = await getPublicFund("fund-1", USER_ID);

    expect(result.data).toMatchObject({ heldUnitsMilli: 12500, holdingValuePaise: 203700 });
  });
});

// App asks batch, item A2.
describe("getFundFolioSummary", () => {
  it("is all zeroes when the learner holds no funds", async () => {
    mockListFundHoldingsForUser.mockResolvedValueOnce([]);

    const result = await getFundFolioSummary(USER_ID);

    expect(result.data).toEqual({
      totalInvestedPaise: 0,
      totalCurrentValuePaise: 0,
      overallReturnsPaise: 0,
      overallReturnsPercent: 0,
    });
  });

  it("sums invested/current value and computes returns across every held fund", async () => {
    mockListFundHoldingsForUser.mockResolvedValueOnce([
      { fundId: "fund-1", unitsMilli: 10000, avgNavPaise: 10000 }, // invested 100000
      { fundId: "fund-2", unitsMilli: 5000, avgNavPaise: 20000 }, // invested 100000
    ]);
    mockGetLatestNav.mockImplementation((fundId: string) =>
      Promise.resolve(fundId === "fund-1" ? { navPaise: 12000, date: "2026-10-01" } : { navPaise: 20000, date: "2026-10-01" }),
    );

    const result = await getFundFolioSummary(USER_ID);

    // fund-1 current value: 10000 * 12000 / 1000 = 120000
    // fund-2 current value: 5000 * 20000 / 1000 = 100000
    expect(result.data).toEqual({
      totalInvestedPaise: 200000,
      totalCurrentValuePaise: 220000,
      overallReturnsPaise: 20000,
      overallReturnsPercent: 10,
    });
  });

  it("skips a fully-redeemed (unitsMilli <= 0) holding", async () => {
    mockListFundHoldingsForUser.mockResolvedValueOnce([{ fundId: "fund-1", unitsMilli: 0, avgNavPaise: 10000 }]);

    const result = await getFundFolioSummary(USER_ID);

    expect(result.data.totalInvestedPaise).toBe(0);
    expect(mockGetLatestNav).not.toHaveBeenCalled();
  });

  it("counts a held fund with no ingested NAV yet at its cost basis (zero gain/loss), never dropped or guessed", async () => {
    mockListFundHoldingsForUser.mockResolvedValueOnce([{ fundId: "fund-1", unitsMilli: 10000, avgNavPaise: 10000 }]);
    mockGetLatestNav.mockResolvedValueOnce(null);

    const result = await getFundFolioSummary(USER_ID);

    expect(result.data).toEqual({
      totalInvestedPaise: 100000,
      totalCurrentValuePaise: 100000,
      overallReturnsPaise: 0,
      overallReturnsPercent: 0,
    });
  });
});
