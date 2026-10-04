import { afterEach, describe, expect, it, vi } from "vitest";

const mockEnv: { REVENUECAT_SECRET_API_KEY?: string } = {};
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const { getRevenueCatProvider, getRevenueCatProviderKind } = await import("./provider");
const { MockRevenueCatProvider } = await import("./providers/mock");
const { RealRevenueCatProvider } = await import("./providers/revenuecat");

afterEach(() => {
  delete mockEnv.REVENUECAT_SECRET_API_KEY;
});

describe("getRevenueCatProviderKind", () => {
  it("auto-selects mock when no API key is configured", () => {
    expect(getRevenueCatProviderKind()).toBe("mock");
  });

  it("auto-selects revenuecat when an API key is configured", () => {
    mockEnv.REVENUECAT_SECRET_API_KEY = "a-real-key";
    expect(getRevenueCatProviderKind()).toBe("revenuecat");
  });
});

describe("getRevenueCatProvider", () => {
  it("returns a MockRevenueCatProvider instance when mock is selected", () => {
    expect(getRevenueCatProvider()).toBeInstanceOf(MockRevenueCatProvider);
  });

  it("returns a RealRevenueCatProvider instance when revenuecat is selected", () => {
    mockEnv.REVENUECAT_SECRET_API_KEY = "a-real-key";
    expect(getRevenueCatProvider()).toBeInstanceOf(RealRevenueCatProvider);
  });
});
