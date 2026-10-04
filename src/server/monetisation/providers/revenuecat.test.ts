import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({ REVENUECAT_SECRET_API_KEY: undefined as string | undefined }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const { RealRevenueCatProvider } = await import("./revenuecat");

const mockFetch = vi.fn();

beforeEach(() => {
  mockEnv.REVENUECAT_SECRET_API_KEY = "rc-secret";
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe("RealRevenueCatProvider.getSubscriberEntitlements", () => {
  it("throws if REVENUECAT_SECRET_API_KEY isn't configured", async () => {
    mockEnv.REVENUECAT_SECRET_API_KEY = undefined;
    await expect(new RealRevenueCatProvider().getSubscriberEntitlements("user-1")).rejects.toThrow(
      /REVENUECAT_SECRET_API_KEY/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls the v1 subscribers endpoint with a Bearer auth header, URL-encoding the id", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ subscriber: { entitlements: {} } }));

    await new RealRevenueCatProvider().getSubscriberEntitlements("user id/with-slash");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.revenuecat.com/v1/subscribers/user%20id%2Fwith-slash",
      { headers: { Authorization: "Bearer rc-secret" } },
    );
  });

  it("maps a known, active entitlement with a future expiry", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ subscriber: { entitlements: { ad_free: { expires_date: "2026-11-04T00:00:00Z" } } } }),
    );

    const result = await new RealRevenueCatProvider().getSubscriberEntitlements("user-1");

    expect(result).toEqual([{ entitlement: "ad_free", expiresAt: new Date("2026-11-04T00:00:00Z") }]);
  });

  it("maps a never-expiring entitlement's null expires_date to null", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ subscriber: { entitlements: { ad_free: { expires_date: null } } } }),
    );

    const result = await new RealRevenueCatProvider().getSubscriberEntitlements("user-1");

    expect(result).toEqual([{ entitlement: "ad_free", expiresAt: null }]);
  });

  it("ignores an entitlement identifier this app doesn't model", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        subscriber: { entitlements: { some_other_app_entitlement: { expires_date: null } } },
      }),
    );

    expect(await new RealRevenueCatProvider().getSubscriberEntitlements("user-1")).toEqual([]);
  });

  it("returns an empty list when the subscriber has no entitlements at all", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ subscriber: { entitlements: {} } }));
    expect(await new RealRevenueCatProvider().getSubscriberEntitlements("user-1")).toEqual([]);
  });

  it("throws on a non-OK HTTP response", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, false, 404));
    await expect(new RealRevenueCatProvider().getSubscriberEntitlements("user-1")).rejects.toThrow(/404/);
  });
});
