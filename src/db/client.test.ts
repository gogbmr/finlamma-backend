import { describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "production" as string,
  DATABASE_URL: "postgres://user:pass@aws-0-region.pooler.supabase.com:6543/postgres",
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockPostgres = vi.fn<(url: string, options: Record<string, unknown>) => object>(() => ({}));
vi.mock("postgres", () => ({ default: (...args: [string, Record<string, unknown>]) => mockPostgres(...args) }));

vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: () => ({}) }));

vi.mock("./schema", () => ({}));

// This isn't a reproduction of the actual hang (that needs Supabase's real
// transaction pooler - see docs/ARCHITECTURE.md decision D13 for how it was
// found, and the manual repro script this decision references) - it's a
// regression guard on the configuration that fixes it, so a future edit
// can't silently drop back to the settings that caused it.
describe("db client pool configuration", () => {
  it("never goes back to max: 1, and keeps connection/statement timeouts set", async () => {
    await import("./client");

    expect(mockPostgres).toHaveBeenCalledTimes(1);
    const [, options] = mockPostgres.mock.calls[0];

    expect(options.prepare).toBe(false);
    // max: 1 is what hung indefinitely: two queries issued concurrently in
    // one request pipeline onto a single logical connection, which the
    // Supavisor transaction pooler can reassign mid-stream. max: 2 gives
    // any accidental concurrent pair its own connection instead.
    expect(options.max).toBeGreaterThanOrEqual(2);
    expect(options.connect_timeout).toBeGreaterThan(0);
    expect(options.idle_timeout).toBeGreaterThan(0);
    expect(
      (options.connection as Record<string, unknown> | undefined)?.statement_timeout,
    ).toBeGreaterThan(0);
  });
});
