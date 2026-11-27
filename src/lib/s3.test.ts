import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  S3_ENDPOINT: "https://xxx.supabase.co/storage/v1/s3" as string | undefined,
  S3_REGION: "ap-south-1" as string | undefined,
  S3_BUCKET: "finlamma" as string | undefined,
  S3_ACCESS_KEY_ID: "test-key" as string | undefined,
  S3_SECRET_ACCESS_KEY: "test-secret" as string | undefined,
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io" as string | undefined,
  UPSTASH_REDIS_REST_TOKEN: "test-token" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

// A real in-memory stand-in for Upstash's Redis client (get/set backed by a
// Map), not a bare vi.fn() stub - lets getCachedSignedDownloadUrl's tests
// exercise the REAL getOrSetJsonCache (src/lib/redis.ts, never mocked
// here) end to end, which is what actually proves "same key -> same URL"
// and "Redis down -> still returns a URL" rather than just proving this
// file calls through to it correctly. `shouldThrow` simulates Redis being
// unreachable - toggled per test, same real class every test.
const redisStore = vi.hoisted(() => new Map<string, unknown>());
const redisState = vi.hoisted(() => ({ shouldThrow: false }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async get(key: string) {
      if (redisState.shouldThrow) throw new Error("Redis unreachable");
      return redisStore.has(key) ? redisStore.get(key) : null;
    }
    async set(key: string, value: unknown) {
      if (redisState.shouldThrow) throw new Error("Redis unreachable");
      redisStore.set(key, value);
    }
  },
}));

const mockSend = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", () => ({
  // Real classes (not arrow functions) so `new S3Client(...)` and the
  // command constructors work under the mock the same way they do against
  // the real package - same trick as the Resend mock in email.test.ts.
  S3Client: class {
    send = mockSend;
  },
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  DeleteObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  GetObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

const mockPresign = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockPresign,
}));

import { deleteObject, getCachedSignedDownloadUrl, getSignedDownloadUrl, uploadObject } from "./s3";

function resetEnv() {
  mockEnv.S3_ENDPOINT = "https://xxx.supabase.co/storage/v1/s3";
  mockEnv.S3_REGION = "ap-south-1";
  mockEnv.S3_BUCKET = "finlamma";
  mockEnv.S3_ACCESS_KEY_ID = "test-key";
  mockEnv.S3_SECRET_ACCESS_KEY = "test-secret";
  mockEnv.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  mockEnv.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

describe("s3", () => {
  beforeEach(() => {
    resetEnv();
    mockSend.mockReset();
    mockPresign.mockReset();
    redisStore.clear();
    redisState.shouldThrow = false;
  });

  describe("when not configured", () => {
    it.each([
      ["S3_ENDPOINT", () => (mockEnv.S3_ENDPOINT = undefined)],
      ["S3_REGION", () => (mockEnv.S3_REGION = undefined)],
      ["S3_BUCKET", () => (mockEnv.S3_BUCKET = undefined)],
      ["S3_ACCESS_KEY_ID", () => (mockEnv.S3_ACCESS_KEY_ID = undefined)],
      ["S3_SECRET_ACCESS_KEY", () => (mockEnv.S3_SECRET_ACCESS_KEY = undefined)],
    ])("uploadObject throws SERVICE_UNAVAILABLE when %s is missing", async (_name, unset) => {
      unset();
      await expect(
        uploadObject("mentors/baby/art.png", Buffer.from("x"), "image/png"),
      ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("deleteObject throws SERVICE_UNAVAILABLE", async () => {
      mockEnv.S3_BUCKET = undefined;
      await expect(deleteObject("mentors/baby/art.png")).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
      });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("getSignedDownloadUrl throws SERVICE_UNAVAILABLE", async () => {
      mockEnv.S3_BUCKET = undefined;
      await expect(getSignedDownloadUrl("mentors/baby/art.png")).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
      });
      expect(mockPresign).not.toHaveBeenCalled();
    });
  });

  it("uploadObject sends a PutObjectCommand with the given key/body/contentType", async () => {
    mockSend.mockResolvedValueOnce({});

    const key = await uploadObject("mentors/baby/art.png", Buffer.from("x"), "image/png");

    expect(key).toBe("mentors/baby/art.png");
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "finlamma",
          Key: "mentors/baby/art.png",
          ContentType: "image/png",
        }),
      }),
    );
  });

  it("deleteObject sends a DeleteObjectCommand with the given key", async () => {
    mockSend.mockResolvedValueOnce({});

    await deleteObject("mentors/baby/art.png");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ Bucket: "finlamma", Key: "mentors/baby/art.png" }),
      }),
    );
  });

  it("getSignedDownloadUrl presigns a GetObjectCommand with the default 6h TTL", async () => {
    mockPresign.mockResolvedValueOnce("https://signed.example/mentors/baby/art.png");

    const url = await getSignedDownloadUrl("mentors/baby/art.png");

    expect(url).toBe("https://signed.example/mentors/baby/art.png");
    expect(mockPresign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: expect.objectContaining({ Bucket: "finlamma", Key: "mentors/baby/art.png" }),
      }),
      { expiresIn: 6 * 60 * 60 },
    );
  });

  it("getSignedDownloadUrl honors a custom TTL", async () => {
    mockPresign.mockResolvedValueOnce("https://signed.example/x");

    await getSignedDownloadUrl("mentors/baby/art.png", 900);

    expect(mockPresign).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: 900,
    });
  });

  describe("getCachedSignedDownloadUrl", () => {
    it("returns the same URL for the same key within the cache TTL, signing only once", async () => {
      mockPresign
        .mockResolvedValueOnce("https://signed.example/worlds/w1/first.webp")
        .mockResolvedValueOnce("https://signed.example/worlds/w1/second.webp");

      const first = await getCachedSignedDownloadUrl("worlds/w1/art.webp");
      const second = await getCachedSignedDownloadUrl("worlds/w1/art.webp");

      expect(first).toBe("https://signed.example/worlds/w1/first.webp");
      expect(second).toBe("https://signed.example/worlds/w1/first.webp"); // cached, not the second mock value
      expect(mockPresign).toHaveBeenCalledTimes(1);
    });

    it("signs again for a different key", async () => {
      mockPresign
        .mockResolvedValueOnce("https://signed.example/worlds/w1/a.webp")
        .mockResolvedValueOnce("https://signed.example/worlds/w2/b.webp");

      const a = await getCachedSignedDownloadUrl("worlds/w1/a.webp");
      const b = await getCachedSignedDownloadUrl("worlds/w2/b.webp");

      expect(a).toBe("https://signed.example/worlds/w1/a.webp");
      expect(b).toBe("https://signed.example/worlds/w2/b.webp");
      expect(mockPresign).toHaveBeenCalledTimes(2);
    });

    it("still returns a URL (signs fresh) when Redis is unreachable, never throwing", async () => {
      redisState.shouldThrow = true;
      mockPresign.mockResolvedValueOnce("https://signed.example/worlds/w1/fresh.webp");

      const url = await getCachedSignedDownloadUrl("worlds/w1/art.webp");

      expect(url).toBe("https://signed.example/worlds/w1/fresh.webp");
    });

    it("still returns a URL (signs fresh every time) when Redis is unconfigured", async () => {
      mockEnv.UPSTASH_REDIS_REST_URL = undefined;
      mockPresign
        .mockResolvedValueOnce("https://signed.example/worlds/w1/one.webp")
        .mockResolvedValueOnce("https://signed.example/worlds/w1/two.webp");

      const first = await getCachedSignedDownloadUrl("worlds/w1/art.webp");
      const second = await getCachedSignedDownloadUrl("worlds/w1/art.webp");

      expect(first).toBe("https://signed.example/worlds/w1/one.webp");
      expect(second).toBe("https://signed.example/worlds/w1/two.webp");
      expect(mockPresign).toHaveBeenCalledTimes(2);
    });
  });
});
