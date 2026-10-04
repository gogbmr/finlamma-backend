import { describe, expect, it } from "vitest";
import type { RevenueCatProvider } from "../types";
import { MockRevenueCatProvider } from "./mock";

describe("MockRevenueCatProvider", () => {
  it("always reports no entitlements, harmlessly", async () => {
    // Called through the interface type (same as every real caller via
    // getRevenueCatProvider()) rather than the concrete class directly -
    // the mock's own implementation ignores the argument, which is a valid,
    // narrower-than-the-interface signature.
    const provider: RevenueCatProvider = new MockRevenueCatProvider();
    expect(await provider.getSubscriberEntitlements("any-user-id")).toEqual([]);
  });
});
