import { describe, expect, it } from "vitest";
import { MockMarketDataProvider } from "./mock";

describe("MockMarketDataProvider.getQuote", () => {
  it("returns the same exact price for the same symbol every call (deterministic, no randomness)", async () => {
    const provider = new MockMarketDataProvider();
    const a = await provider.getQuote("RELIANCE", "NSE");
    const b = await provider.getQuote("RELIANCE", "NSE");

    expect(a!.pricePaise).toBe(b!.pricePaise);
    expect(a!.pricePaise).toBe(284510); // 2845.10 - docs/ECONOMY.md's seeded baseline
  });

  it("produces a self-consistent quote shape (high >= price >= low, etc.)", async () => {
    const quote = await new MockMarketDataProvider().getQuote("TCS", "NSE");

    expect(quote!.highPaise).toBeGreaterThanOrEqual(quote!.pricePaise);
    expect(quote!.lowPaise).toBeLessThanOrEqual(quote!.pricePaise);
    expect(quote!.changePaise).toBe(quote!.pricePaise - quote!.previousClosePaise);
  });

  it("never throws for a symbol outside the baseline table - falls back to a deterministic price", async () => {
    const a = await new MockMarketDataProvider().getQuote("UNKNOWNSYMBOL", "NSE");
    const b = await new MockMarketDataProvider().getQuote("UNKNOWNSYMBOL", "NSE");

    expect(a).not.toBeNull();
    expect(a!.pricePaise).toBe(b!.pricePaise);
  });
});

describe("MockMarketDataProvider.getCandles", () => {
  it("returns the requested number of candles, oldest first", async () => {
    const candles = await new MockMarketDataProvider().getCandles("RELIANCE", "NSE", "1M");

    expect(candles).toHaveLength(22);
    expect(candles[0]!.timestamp.getTime()).toBeLessThan(candles.at(-1)!.timestamp.getTime());
  });

  it("is deterministic across calls for the same symbol/timeframe", async () => {
    const provider = new MockMarketDataProvider();
    const a = await provider.getCandles("TCS", "NSE", "1W");
    const b = await provider.getCandles("TCS", "NSE", "1W");

    expect(a.map((c) => c.closePaise)).toEqual(b.map((c) => c.closePaise));
  });

  it("every candle has high >= open/close >= low", async () => {
    const candles = await new MockMarketDataProvider().getCandles("RELIANCE", "NSE", "1D");

    for (const c of candles) {
      expect(c.highPaise).toBeGreaterThanOrEqual(c.openPaise);
      expect(c.highPaise).toBeGreaterThanOrEqual(c.closePaise);
      expect(c.lowPaise).toBeLessThanOrEqual(c.openPaise);
      expect(c.lowPaise).toBeLessThanOrEqual(c.closePaise);
    }
  });
});
