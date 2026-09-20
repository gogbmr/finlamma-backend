import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  S3_ENDPOINT: "https://xxx.supabase.co/storage/v1/s3" as string | undefined,
  S3_REGION: "ap-south-1" as string | undefined,
  S3_BUCKET: "finlamma" as string | undefined,
  S3_ACCESS_KEY_ID: "test-key" as string | undefined,
  S3_SECRET_ACCESS_KEY: "test-secret" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

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

import { deleteObject, getSignedDownloadUrl, uploadObject } from "./s3";

function resetEnv() {
  mockEnv.S3_ENDPOINT = "https://xxx.supabase.co/storage/v1/s3";
  mockEnv.S3_REGION = "ap-south-1";
  mockEnv.S3_BUCKET = "finlamma";
  mockEnv.S3_ACCESS_KEY_ID = "test-key";
  mockEnv.S3_SECRET_ACCESS_KEY = "test-secret";
}

describe("s3", () => {
  beforeEach(() => {
    resetEnv();
    mockSend.mockReset();
    mockPresign.mockReset();
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
});
