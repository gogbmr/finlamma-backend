import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validEnv = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:pass@host:6543/postgres",
  DATABASE_URL_DIRECT: "postgresql://user:pass@host:5432/postgres",
};

describe("env", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads with only the required vars set", async () => {
    for (const [key, value] of Object.entries(validEnv)) vi.stubEnv(key, value);
    const { env } = await import("./env");
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.NODE_ENV).toBe("test");
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("throws when a required var is missing", async () => {
    for (const [key, value] of Object.entries(validEnv)) {
      if (key === "DATABASE_URL_DIRECT") continue;
      vi.stubEnv(key, value);
    }
    vi.stubEnv("DATABASE_URL_DIRECT", "");

    await expect(import("./env")).rejects.toThrow(
      "Invalid environment variables",
    );
  });
});
