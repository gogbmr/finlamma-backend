import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { TWELVEDATA_API_KEY: "test-key" } }));

const { TwelveDataProvider } = await import("./twelvedata");

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

function mockFetchOnce(body: unknown) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    json: async () => body,
  });
}

describe("TwelveDataProvider.getQuote", () => {
  it("converts decimal-rupee strings to exact integer paise", async () => {
    mockFetchOnce({
      symbol: "RELIANCE",
      exchange: "NSE",
      timestamp: 1_700_000_000,
      open: "2830.00",
      high: "2852.00",
      low: "2825.00",
      close: "2845.10",
      previous_close: "2832.60",
      change: "12.50",
      percent_change: "0.44",
      volume: "5231400",
    });

    const quote = await new TwelveDataProvider().getQuote("RELIANCE", "NSE");

    expect(quote).toEqual({
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
      asOf: new Date(1_700_000_000 * 1000),
    });
  });

  it("returns null (not a throw) when the vendor reports an error status", async () => {
    mockFetchOnce({ status: "error", code: 400, message: "symbol not found" });

    const quote = await new TwelveDataProvider().getQuote("NOPE", "NSE");

    expect(quote).toBeNull();
  });

  it("returns null when the response has no close price", async () => {
    mockFetchOnce({ symbol: "RELIANCE" });

    const quote = await new TwelveDataProvider().getQuote("RELIANCE", "NSE");

    expect(quote).toBeNull();
  });

  it("wraps a network failure as SERVICE_UNAVAILABLE, never a raw throw", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));

    await expect(new TwelveDataProvider().getQuote("RELIANCE", "NSE")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });
});

describe("TwelveDataProvider.getCandles", () => {
  it("normalizes vendor candles to oldest-first with exact paise", async () => {
    mockFetchOnce({
      status: "ok",
      values: [
        { datetime: "2026-01-02", open: "2840.00", high: "2850.00", low: "2830.00", close: "2845.00", volume: "100" },
        { datetime: "2026-01-01", open: "2830.00", high: "2840.00", low: "2820.00", close: "2835.00", volume: "90" },
      ],
    });

    const candles = await new TwelveDataProvider().getCandles("RELIANCE", "NSE", "1M");

    expect(candles.map((c) => c.timestamp.toISOString().slice(0, 10))).toEqual(["2026-01-01", "2026-01-02"]);
    expect(candles[0]).toMatchObject({ openPaise: 283000, closePaise: 283500, volume: 90 });
  });

  it("returns an empty array (not a throw) when the vendor reports an error status", async () => {
    mockFetchOnce({ status: "error", code: 400, message: "symbol not found" });

    const candles = await new TwelveDataProvider().getCandles("NOPE", "NSE", "1D");

    expect(candles).toEqual([]);
  });
});
