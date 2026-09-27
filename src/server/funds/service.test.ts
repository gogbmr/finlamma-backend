import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListActiveFunds = vi.fn();
const mockGetPublicFundById = vi.fn();
const mockGetLatestNav = vi.fn();
vi.mock("./repo", () => ({
  listActiveFunds: () => mockListActiveFunds(),
  getPublicFundById: (id: unknown) => mockGetPublicFundById(id),
  getLatestNav: (fundId: unknown) => mockGetLatestNav(fundId),
}));

const { listPublicFunds, getPublicFund } = await import("./service");

const FUND = { id: "fund-1", name: "Finlamma Test Fund", active: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listPublicFunds", () => {
  it("merges each fund's latest NAV and includes the disclaimer", async () => {
    mockListActiveFunds.mockResolvedValueOnce([FUND]);
    mockGetLatestNav.mockResolvedValueOnce({ navPaise: 16296, date: "2026-09-25" });

    const result = await listPublicFunds();

    expect(result.data).toEqual([{ ...FUND, latestNav: { navPaise: 16296, date: "2026-09-25" } }]);
    expect(result.disclaimer).toContain("V Money");
    expect(mockGetLatestNav).toHaveBeenCalledWith("fund-1");
  });

  it("returns latestNav: null for a never-ingested fund, not an error", async () => {
    mockListActiveFunds.mockResolvedValueOnce([FUND]);
    mockGetLatestNav.mockResolvedValueOnce(null);

    const result = await listPublicFunds();

    expect(result.data[0]!.latestNav).toBeNull();
  });
});

describe("getPublicFund", () => {
  it("throws NOT_FOUND for an unknown fund id", async () => {
    mockGetPublicFundById.mockResolvedValueOnce(null);

    await expect(getPublicFund("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for an inactive fund", async () => {
    mockGetPublicFundById.mockResolvedValueOnce({ ...FUND, active: false });

    await expect(getPublicFund("fund-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the fund's detail with its latest NAV", async () => {
    mockGetPublicFundById.mockResolvedValueOnce(FUND);
    mockGetLatestNav.mockResolvedValueOnce({ navPaise: 16296, date: "2026-09-25" });

    const result = await getPublicFund("fund-1");

    expect(result.data).toMatchObject({ id: "fund-1", latestNav: { navPaise: 16296, date: "2026-09-25" } });
  });
});
