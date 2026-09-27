import { describe, expect, it } from "vitest";
import { findAdviceLikePhrases } from "./advice-language";

describe("findAdviceLikePhrases", () => {
  it("returns an empty list for purely educational text", () => {
    expect(
      findAdviceLikePhrases(
        "A bank's biggest risk is loans that don't get repaid - watching how much lending goes bad each year shows how carefully it lends.",
      ),
    ).toEqual([]);
  });

  it("flags an explicit buy/sell signal", () => {
    expect(findAdviceLikePhrases("This is a strong buy right now.")).toContain("strong buy");
  });

  it("flags a target-price phrase", () => {
    expect(findAdviceLikePhrases("Our target price for this stock is ₹5,000.")).toContain(
      "target price",
    );
  });

  it("is case-insensitive", () => {
    expect(findAdviceLikePhrases("BUY NOW before it's too late")).toContain("buy now");
  });

  it("returns every distinct match, not just the first", () => {
    const found = findAdviceLikePhrases("Guaranteed return, will rise, definitely a safe bet.");
    expect(found).toEqual(
      expect.arrayContaining(["guaranteed return", "will rise", "safe bet"]),
    );
  });
});
