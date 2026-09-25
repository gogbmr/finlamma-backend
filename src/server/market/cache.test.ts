import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetOrSetJsonCache = vi.fn();
vi.mock("@/lib/redis", () => ({
  getOrSetJsonCache: (key: unknown, ttl: unknown, compute: unknown) =>
    mockGetOrSetJsonCache(key, ttl, compute),
}));

const mockGetQuote = vi.fn();
const mockGetCandles = vi.fn();
vi.mock("./provider", () => ({
  getMarketDataProvider: () => ({ getQuote: mockGetQuote, getCandles: mockGetCandles }),
}));

const { getCachedCandles, getCachedQuote } = await import("./cache");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCachedQuote", () => {
  it("delegates to the cache with a symbol+exchange key, re-hydrating asOf into a real Date", async () => {
    mockGetOrSetJsonCache.mockImplementationOnce(async (key: string, _ttl: number, compute: () => unknown) => {
      expect(key).toBe("market:quote:NSE:RELIANCE");
      return compute();
    });
    mockGetQuote.mockResolvedValueOnce({
      symbol: "RELIANCE",
      exchange: "NSE",
      pricePaise: 284510,
      changePaise: 0,
      changePercent: 0,
      openPaise: 284510,
      highPaise: 284510,
      lowPaise: 284510,
      previousClosePaise: 284510,
      volume: 0,
      asOf: new Date("2026-09-25T10:00:00.000Z"),
    });

    const quote = await getCachedQuote("RELIANCE", "NSE");

    expect(quote?.asOf).toBeInstanceOf(Date);
    expect(quote?.pricePaise).toBe(284510);
  });

  it("re-hydrates asOf correctly even after a cache round-trip serializes it to a string", async () => {
    mockGetOrSetJsonCache.mockResolvedValueOnce({
      symbol: "RELIANCE",
      exchange: "NSE",
      pricePaise: 284510,
      changePaise: 0,
      changePercent: 0,
      openPaise: 284510,
      highPaise: 284510,
      lowPaise: 284510,
      previousClosePaise: 284510,
      volume: 0,
      asOf: "2026-09-25T10:00:00.000Z", // simulates what a real cache hit returns after JSON round-trip
    });

    const quote = await getCachedQuote("RELIANCE", "NSE");

    expect(quote?.asOf).toBeInstanceOf(Date);
    expect(quote?.asOf.toISOString()).toBe("2026-09-25T10:00:00.000Z");
  });

  it("returns null when the provider has no quote, without throwing on rehydration", async () => {
    mockGetOrSetJsonCache.mockResolvedValueOnce(null);

    expect(await getCachedQuote("RELIANCE", "NSE")).toBeNull();
  });
});

describe("getCachedCandles", () => {
  it("uses a symbol+exchange+timeframe cache key and re-hydrates every candle's timestamp", async () => {
    mockGetOrSetJsonCache.mockImplementationOnce(async (key: string) => {
      expect(key).toBe("market:candles:NSE:RELIANCE:1M");
      return [
        {
          timestamp: "2026-09-01T00:00:00.000Z",
          openPaise: 1,
          highPaise: 2,
          lowPaise: 1,
          closePaise: 2,
          volume: 10,
        },
      ];
    });

    const candles = await getCachedCandles("RELIANCE", "NSE", "1M");

    expect(candles[0]!.timestamp).toBeInstanceOf(Date);
  });
});
