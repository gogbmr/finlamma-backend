import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io" as string | undefined,
  UPSTASH_REDIS_REST_TOKEN: "test-token" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockPing = vi.hoisted(() => vi.fn());
vi.mock("@upstash/redis", () => ({
  // Real class (not an arrow function) so `new Redis(...)` works under the
  // mock the same way it does against the real package - same trick as the
  // S3Client mock in s3.test.ts.
  Redis: class {
    ping = mockPing;
  },
}));

const mockLimit = vi.hoisted(() => vi.fn());
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(
    class {
      limit = mockLimit;
    },
    { slidingWindow: vi.fn((requests: number, window: string) => ({ requests, window })) },
  ),
}));

import { checkRateLimit, checkRedisReachable, type RateLimitConfig } from "./redis";

const CONFIG: RateLimitConfig = { requests: 30, window: "10 s", prefix: "ratelimit:test" };

function resetEnv() {
  mockEnv.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  mockEnv.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

beforeEach(() => {
  resetEnv();
  mockPing.mockReset();
  mockLimit.mockReset();
});

describe("checkRateLimit", () => {
  describe("when Upstash isn't configured", () => {
    it.each([
      ["UPSTASH_REDIS_REST_URL", () => (mockEnv.UPSTASH_REDIS_REST_URL = undefined)],
      ["UPSTASH_REDIS_REST_TOKEN", () => (mockEnv.UPSTASH_REDIS_REST_TOKEN = undefined)],
    ])("fails OPEN (allowed, configured: false) when %s is missing and failOpen is true", async (_name, unset) => {
      unset();

      const result = await checkRateLimit("user_1", CONFIG, true);

      expect(result).toEqual({ allowed: true, configured: false });
      expect(mockLimit).not.toHaveBeenCalled();
    });

    it("fails CLOSED (not allowed, configured: false) when failOpen is false", async () => {
      mockEnv.UPSTASH_REDIS_REST_URL = undefined;

      const result = await checkRateLimit("user_1", CONFIG, false);

      expect(result).toEqual({ allowed: false, configured: false });
      expect(mockLimit).not.toHaveBeenCalled();
    });
  });

  describe("when Upstash is configured", () => {
    it("allows the request when under the limit", async () => {
      mockLimit.mockResolvedValueOnce({ success: true });

      const result = await checkRateLimit("user_1", CONFIG, true);

      expect(result).toEqual({ allowed: true, configured: true });
      expect(mockLimit).toHaveBeenCalledWith("user_1");
    });

    it("blocks the request when over the limit, even with failOpen: true", async () => {
      mockLimit.mockResolvedValueOnce({ success: false });

      const result = await checkRateLimit("user_1", CONFIG, true);

      expect(result).toEqual({ allowed: false, configured: true });
    });

    it("blocks the request when over the limit with failOpen: false", async () => {
      mockLimit.mockResolvedValueOnce({ success: false });

      const result = await checkRateLimit("user_1", CONFIG, false);

      expect(result).toEqual({ allowed: false, configured: true });
    });

    it("fails OPEN when the underlying check throws and failOpen is true", async () => {
      mockLimit.mockRejectedValueOnce(new Error("network timeout"));

      const result = await checkRateLimit("user_1", CONFIG, true);

      expect(result).toEqual({ allowed: true, configured: true });
    });

    it("fails CLOSED when the underlying check throws and failOpen is false", async () => {
      mockLimit.mockRejectedValueOnce(new Error("network timeout"));

      const result = await checkRateLimit("user_1", CONFIG, false);

      expect(result).toEqual({ allowed: false, configured: true });
    });
  });
});

describe("checkRedisReachable", () => {
  it("returns 'unconfigured' when Upstash env vars aren't set", async () => {
    mockEnv.UPSTASH_REDIS_REST_URL = undefined;

    expect(await checkRedisReachable()).toBe("unconfigured");
    expect(mockPing).not.toHaveBeenCalled();
  });

  it("returns 'ok' when a live ping succeeds", async () => {
    mockPing.mockResolvedValueOnce("PONG");

    expect(await checkRedisReachable()).toBe("ok");
  });

  it("returns 'unreachable' when a live ping fails", async () => {
    mockPing.mockRejectedValueOnce(new Error("connection refused"));

    expect(await checkRedisReachable()).toBe("unreachable");
  });
});
