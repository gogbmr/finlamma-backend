import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  EXPO_ACCESS_TOKEN: undefined as string | undefined,
  PUSH_PROVIDER: undefined as "mock" | "expo" | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const { getPushProvider, getPushProviderKind } = await import("./provider");
const { MockPushProvider } = await import("./providers/mock");
const { ExpoPushProvider } = await import("./providers/expo");

beforeEach(() => {
  mockEnv.EXPO_ACCESS_TOKEN = undefined;
  mockEnv.PUSH_PROVIDER = undefined;
});

describe("getPushProviderKind", () => {
  it("is 'mock' with nothing configured", () => {
    expect(getPushProviderKind()).toBe("mock");
  });

  it("is 'expo' once EXPO_ACCESS_TOKEN is set", () => {
    mockEnv.EXPO_ACCESS_TOKEN = "token";
    expect(getPushProviderKind()).toBe("expo");
  });

  it("PUSH_PROVIDER explicitly overrides the token-presence default either way", () => {
    mockEnv.EXPO_ACCESS_TOKEN = "token";
    mockEnv.PUSH_PROVIDER = "mock";
    expect(getPushProviderKind()).toBe("mock");

    mockEnv.EXPO_ACCESS_TOKEN = undefined;
    mockEnv.PUSH_PROVIDER = "expo";
    expect(getPushProviderKind()).toBe("expo");
  });
});

describe("getPushProvider", () => {
  it("returns a MockPushProvider when unconfigured", () => {
    expect(getPushProvider()).toBeInstanceOf(MockPushProvider);
  });

  it("returns an ExpoPushProvider when a token is set", () => {
    mockEnv.EXPO_ACCESS_TOKEN = "token";
    expect(getPushProvider()).toBeInstanceOf(ExpoPushProvider);
  });
});

describe("MockPushProvider", () => {
  it("never throws and reports every message as sent", async () => {
    const provider = new MockPushProvider();

    const results = await provider.send([
      { expoPushToken: "a", title: "T1", body: "B1" },
      { expoPushToken: "b", title: "T2", body: "B2" },
    ]);

    expect(results).toEqual([{ status: "sent" }, { status: "sent" }]);
  });
});

describe("ExpoPushProvider", () => {
  it("throws SERVICE_UNAVAILABLE when EXPO_ACCESS_TOKEN is not configured", async () => {
    const provider = new ExpoPushProvider();

    await expect(provider.send([{ expoPushToken: "a", title: "T", body: "B" }])).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });
});
