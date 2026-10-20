import { describe, expect, it } from "vitest";
import { buildFundOrderReasonLocalized } from "./i18n";

describe("buildFundOrderReasonLocalized", () => {
  it("builds en/hi/hx for a manual buy", () => {
    const result = buildFundOrderReasonLocalized("buy", 16296, "2026-09-25");

    expect(result.en).toBe("Bought fund units @ NAV ₹162.96 (2026-09-25)");
    expect(result.hi).toContain("2026-09-25");
    expect(result.hx).toContain("khareedi");
    expect(result.en.startsWith("SIP")).toBe(false);
  });

  it("builds en/hi/hx for a manual sell", () => {
    const result = buildFundOrderReasonLocalized("sell", 16296, "2026-09-25");

    expect(result.en).toBe("Sold fund units @ NAV ₹162.96 (2026-09-25)");
    expect(result.hx).toContain("bechi");
  });

  it("prefixes every language with SIP: for a SIP execution", () => {
    const result = buildFundOrderReasonLocalized("buy", 16296, "2026-09-25", true);

    expect(result.en).toMatch(/^SIP: /);
    expect(result.hi).toMatch(/^SIP: /);
    expect(result.hx).toMatch(/^SIP: /);
  });
});
