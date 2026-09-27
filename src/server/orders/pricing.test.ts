import { describe, expect, it } from "vitest";
import { clampFillPrice, isLimitMarketable } from "./pricing";

describe("isLimitMarketable", () => {
  it("a BUY limit is marketable when the current price is at or below the limit", () => {
    expect(isLimitMarketable("buy", 10000, 9999)).toBe(true);
    expect(isLimitMarketable("buy", 10000, 10000)).toBe(true);
    expect(isLimitMarketable("buy", 10000, 10001)).toBe(false);
  });

  it("a SELL limit is marketable when the current price is at or above the limit", () => {
    expect(isLimitMarketable("sell", 10000, 10001)).toBe(true);
    expect(isLimitMarketable("sell", 10000, 10000)).toBe(true);
    expect(isLimitMarketable("sell", 10000, 9999)).toBe(false);
  });
});

describe("clampFillPrice", () => {
  it("a BUY never pays more than its limit, and benefits when the market is cheaper", () => {
    expect(clampFillPrice("buy", 10000, 9000)).toBe(9000); // price improvement
    expect(clampFillPrice("buy", 10000, 10000)).toBe(10000);
  });

  it("a SELL never receives less than its limit, and benefits when the market is higher", () => {
    expect(clampFillPrice("sell", 10000, 11000)).toBe(11000); // price improvement
    expect(clampFillPrice("sell", 10000, 10000)).toBe(10000);
  });
});
