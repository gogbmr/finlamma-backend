import { describe, expect, it } from "vitest";
import { buildTradeReasonLocalized } from "./i18n";

describe("buildTradeReasonLocalized", () => {
  it("builds en/hi/hx for a buy fill", () => {
    const result = buildTradeReasonLocalized("buy", 2, "RELIANCE", 284510);

    expect(result.en).toBe("Bought 2 RELIANCE @ ₹2845.10");
    expect(result.hi).toContain("RELIANCE");
    expect(result.hi).toContain("2");
    expect(result.hx).toContain("RELIANCE");
    expect(result.hx).toContain("khareede");
  });

  it("builds en/hi/hx for a sell fill", () => {
    const result = buildTradeReasonLocalized("sell", 1, "TCS", 350000);

    expect(result.en).toBe("Sold 1 TCS @ ₹3500.00");
    expect(result.hx).toContain("beche");
  });

  it("keeps the instrument symbol in Latin script in every language", () => {
    const result = buildTradeReasonLocalized("buy", 1, "HDFCBANK", 161200);

    expect(result.en).toContain("HDFCBANK");
    expect(result.hi).toContain("HDFCBANK");
    expect(result.hx).toContain("HDFCBANK");
  });
});
