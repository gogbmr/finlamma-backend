import { describe, expect, it } from "vitest";
import { MockNewsProvider } from "./mock";

describe("MockNewsProvider", () => {
  it("returns the same fixed set of items on every call - deterministic, never randomized", async () => {
    const provider = new MockNewsProvider();
    const first = await provider.fetchLatest();
    const second = await provider.fetchLatest();

    expect(first.length).toBeGreaterThan(0);
    expect(first.map((i) => i.externalId)).toEqual(second.map((i) => i.externalId));
  });

  it("every item has a unique externalId", async () => {
    const items = await new MockNewsProvider().fetchLatest();
    const ids = items.map((i) => i.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every item has a non-empty headline, summary and url", async () => {
    const items = await new MockNewsProvider().fetchLatest();
    for (const item of items) {
      expect(item.headline.trim()).not.toBe("");
      expect(item.summary.trim()).not.toBe("");
      expect(item.url.trim()).not.toBe("");
    }
  });
});
