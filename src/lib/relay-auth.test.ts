import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv: { RELAY_SHARED_SECRET?: string } = {};
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/redis", () => ({
  checkRateLimit: (id: unknown, config: unknown, failOpen: unknown) =>
    mockCheckRateLimit(id, config, failOpen),
}));

const { requireRelaySecret } = await import("./relay-auth");

function requestWithSecret(secret: string | null) {
  const headers = new Headers();
  if (secret !== null) headers.set("X-Relay-Secret", secret);
  return new Request("http://localhost/api/v1/relay/config", { headers });
}

beforeEach(() => {
  mockEnv.RELAY_SHARED_SECRET = "correct-secret-value";
  mockCheckRateLimit.mockResolvedValue({ allowed: true, configured: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("requireRelaySecret", () => {
  it("resolves when the header matches the configured secret exactly", async () => {
    await expect(requireRelaySecret(requestWithSecret("correct-secret-value"))).resolves.toBeUndefined();
  });

  it("rejects with UNAUTHENTICATED and no detail when the header is wrong", async () => {
    await expect(requireRelaySecret(requestWithSecret("wrong-secret"))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Unauthorized",
      details: undefined,
    });
  });

  it("rejects with UNAUTHENTICATED when the header is missing entirely", async () => {
    await expect(requireRelaySecret(requestWithSecret(null))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Unauthorized",
    });
  });

  it("rejects a secret that's a different length than the real one (no length-based early exit)", async () => {
    await expect(requireRelaySecret(requestWithSecret("short"))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(
      requireRelaySecret(requestWithSecret("a-much-longer-guess-than-the-real-secret-value-here")),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("fails closed with SERVICE_UNAVAILABLE when RELAY_SHARED_SECRET isn't configured", async () => {
    mockEnv.RELAY_SHARED_SECRET = undefined;

    await expect(requireRelaySecret(requestWithSecret("anything"))).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    // Never even reaches the rate limiter or compares anything - an ops
    // config gap, not a caller-driven check.
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("rejects with RATE_LIMITED when the limiter refuses, before comparing the secret", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, configured: true });

    await expect(requireRelaySecret(requestWithSecret("correct-secret-value"))).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("rate-limits with failOpen: false - an unreachable Redis refuses the request, never lets it through", async () => {
    await requireRelaySecret(requestWithSecret("correct-secret-value"));

    expect(mockCheckRateLimit).toHaveBeenCalledWith("relay-config", expect.any(Object), false);
  });

  it("never includes the provided or configured secret value anywhere in the thrown error", async () => {
    try {
      await requireRelaySecret(requestWithSecret("some-guessed-value"));
      expect.unreachable("should have thrown");
    } catch (err) {
      const serialized =
        err instanceof Error
          ? JSON.stringify({ ...err, message: err.message, stack: err.stack })
          : JSON.stringify(err);
      expect(serialized).not.toContain("some-guessed-value");
      expect(serialized).not.toContain("correct-secret-value");
    }
  });
});
