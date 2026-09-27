import { afterEach, describe, expect, it, vi } from "vitest";

const mockEnv: { TWELVEDATA_API_KEY?: string; MARKET_DATA_PROVIDER?: "mock" | "twelvedata" } = {};
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const { getMarketDataProvider, getMarketDataProviderKind } = await import("./provider");
const { MockMarketDataProvider } = await import("./providers/mock");
const { TwelveDataProvider } = await import("./providers/twelvedata");

afterEach(() => {
  delete mockEnv.TWELVEDATA_API_KEY;
  delete mockEnv.MARKET_DATA_PROVIDER;
});

describe("getMarketDataProviderKind", () => {
  it("auto-selects mock when no API key is configured and no override is set", () => {
    expect(getMarketDataProviderKind()).toBe("mock");
  });

  it("auto-selects twelvedata when an API key is configured and no override is set", () => {
    mockEnv.TWELVEDATA_API_KEY = "a-real-key";
    expect(getMarketDataProviderKind()).toBe("twelvedata");
  });

  it("an explicit override wins even with a key configured", () => {
    mockEnv.TWELVEDATA_API_KEY = "a-real-key";
    mockEnv.MARKET_DATA_PROVIDER = "mock";
    expect(getMarketDataProviderKind()).toBe("mock");
  });

  it("an explicit override to twelvedata wins even with no key (fails loudly later, not silently)", () => {
    mockEnv.MARKET_DATA_PROVIDER = "twelvedata";
    expect(getMarketDataProviderKind()).toBe("twelvedata");
  });
});

describe("getMarketDataProvider", () => {
  it("returns a MockMarketDataProvider instance when mock is selected", () => {
    expect(getMarketDataProvider()).toBeInstanceOf(MockMarketDataProvider);
  });

  it("returns a TwelveDataProvider instance when twelvedata is selected", () => {
    mockEnv.TWELVEDATA_API_KEY = "a-real-key";
    expect(getMarketDataProvider()).toBeInstanceOf(TwelveDataProvider);
  });
});
