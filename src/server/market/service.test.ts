import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetInstrumentBySymbol = vi.fn();
const mockListActiveInstruments = vi.fn();
vi.mock("@/server/trading/repo", () => ({
  getInstrumentBySymbol: (symbol: unknown) => mockGetInstrumentBySymbol(symbol),
  listActiveInstruments: () => mockListActiveInstruments(),
}));

const mockGetCachedQuote = vi.fn();
const mockGetCachedCandles = vi.fn();
vi.mock("./cache", () => ({
  getCachedQuote: (symbol: unknown, exchange: unknown) => mockGetCachedQuote(symbol, exchange),
  getCachedCandles: (symbol: unknown, exchange: unknown, tf: unknown) =>
    mockGetCachedCandles(symbol, exchange, tf),
}));

const {
  getInstrumentCandles,
  getPublicInstrumentBySymbol,
  listPublicInstruments,
} = await import("./service");

beforeEach(() => {
  vi.clearAllMocks();
});

function instrumentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "inst_1",
    symbol: "RELIANCE",
    exchange: "NSE",
    name: "Reliance Industries Ltd",
    sector: "Oil & Gas",
    about: { en: "a", hi: "a", hx: "a" },
    tip: { en: "t", hi: "t", hx: "t" },
    tags: ["Large cap"],
    mcap: null,
    pe: null,
    lotSize: 1,
    active: true,
    halted: false,
    ...overrides,
  };
}

function quote(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    symbol: "RELIANCE",
    exchange: "NSE",
    pricePaise: 284510,
    changePaise: 1250,
    changePercent: 0.44,
    openPaise: 283000,
    highPaise: 285200,
    lowPaise: 282500,
    previousClosePaise: 283260,
    volume: 5231400,
    asOf: new Date("2026-09-25T10:00:00.000Z"),
    ...overrides,
  };
}

describe("listPublicInstruments", () => {
  it("merges each active instrument with its own live quote", async () => {
    mockListActiveInstruments.mockResolvedValueOnce([instrumentRow()]);
    mockGetCachedQuote.mockResolvedValueOnce(quote());

    const result = await listPublicInstruments();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ symbol: "RELIANCE", quote: { pricePaise: 284510 } });
    expect(result.disclaimer).toMatch(/investment advice/i);
  });

  it("never lets one symbol's failed quote fetch break the whole list", async () => {
    mockListActiveInstruments.mockResolvedValueOnce([
      instrumentRow({ symbol: "RELIANCE" }),
      instrumentRow({ symbol: "TCS", id: "inst_2" }),
    ]);
    mockGetCachedQuote.mockResolvedValueOnce(quote());
    mockGetCachedQuote.mockRejectedValueOnce(new Error("vendor down"));

    const result = await listPublicInstruments();

    expect(result.data).toHaveLength(2);
    expect(result.data[0]!.quote).not.toBeNull();
    expect(result.data[1]!.quote).toBeNull();
  });

  it("shows quote: null (never a synthetic price) when the vendor has no data", async () => {
    mockListActiveInstruments.mockResolvedValueOnce([instrumentRow()]);
    mockGetCachedQuote.mockResolvedValueOnce(null);

    const result = await listPublicInstruments();

    expect(result.data[0]!.quote).toBeNull();
  });
});

describe("getPublicInstrumentBySymbol", () => {
  it("throws NOT_FOUND for an unknown symbol", async () => {
    mockGetInstrumentBySymbol.mockResolvedValueOnce(null);

    await expect(getPublicInstrumentBySymbol("NOPE")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws NOT_FOUND for an inactive instrument", async () => {
    mockGetInstrumentBySymbol.mockResolvedValueOnce(instrumentRow({ active: false }));

    await expect(getPublicInstrumentBySymbol("RELIANCE")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns the instrument detail with about/tip and a live quote", async () => {
    mockGetInstrumentBySymbol.mockResolvedValueOnce(instrumentRow());
    mockGetCachedQuote.mockResolvedValueOnce(quote());

    const result = await getPublicInstrumentBySymbol("RELIANCE");

    expect(result.data.about).toEqual({ en: "a", hi: "a", hx: "a" });
    expect(result.data.quote?.pricePaise).toBe(284510);
    expect(result.disclaimer).toMatch(/investment advice/i);
  });
});

describe("getInstrumentCandles", () => {
  it("throws NOT_FOUND for an unknown symbol", async () => {
    mockGetInstrumentBySymbol.mockResolvedValueOnce(null);

    await expect(getInstrumentCandles("NOPE", "1M")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns candles for an active instrument", async () => {
    mockGetInstrumentBySymbol.mockResolvedValueOnce(instrumentRow());
    mockGetCachedCandles.mockResolvedValueOnce([
      {
        timestamp: new Date("2026-09-01T00:00:00.000Z"),
        openPaise: 1,
        highPaise: 2,
        lowPaise: 1,
        closePaise: 2,
        volume: 10,
      },
    ]);

    const result = await getInstrumentCandles("RELIANCE", "1M");

    expect(mockGetCachedCandles).toHaveBeenCalledWith("RELIANCE", "NSE", "1M");
    expect(result.data[0]).toMatchObject({ openPaise: 1, closePaise: 2 });
  });
});
