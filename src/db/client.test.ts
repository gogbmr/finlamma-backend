import { describe, expect, it, vi } from "vitest";
import { DB_CONCURRENCY_LIMIT } from "@/lib/concurrency-limit";

const mockEnv = vi.hoisted(() => ({
  NODE_ENV: "production" as string,
  DATABASE_URL:
    "postgres://user:pass@aws-0-region.pooler.supabase.com:6543/postgres",
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockPostgres = vi.fn<
  (url: string, options: Record<string, unknown>) => object
>(() => ({}));
vi.mock("postgres", () => ({
  default: (...args: [string, Record<string, unknown>]) =>
    mockPostgres(...args),
}));

vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: () => ({}) }));

vi.mock("./schema", () => ({}));

// This isn't a reproduction of the actual hang (that needs Supabase's real
// transaction pooler - see docs/ARCHITECTURE.md decisions D13 and D72 for
// how each was found, and scripts/verify-db-pool.ts, the manual repro both
// decisions reference - it tests a concurrent PAIR and a concurrent TRIPLE
// against the real pooler, since D72 proved max: 2 only ever covered a
// pair) - this is a regression guard on the configuration alone, so a
// future edit can't silently drop back to a value too low for either.
describe("db client pool configuration", () => {
  it("never drops below the minimum max proven safe (see D13/D72), and keeps connection/statement timeouts set", async () => {
    await import("./client");

    expect(mockPostgres).toHaveBeenCalledTimes(1);
    const [, options] = mockPostgres.mock.calls[0];

    expect(options.prepare).toBe(false);
    // max: 1 hung on a concurrent PAIR (D13). max: 2 then hung on a
    // concurrent TRIPLE (D72, 2026-10-06) - a real page running one query
    // alongside a Promise.all of two more. Both are the same postgres.js/
    // Supavisor transaction-pooler pipelining mismatch: an extra query
    // beyond what `max` can give its own connection gets wedged waiting
    // for a response that never arrives, and that connection is then never
    // reclaimed either (see D72's full account) - so this number must stay
    // at or above however many concurrent queries the codebase actually
    // issues from one request, not just "more than 1".
    expect(options.max).toBeGreaterThanOrEqual(2);
    expect(options.connect_timeout).toBeGreaterThan(0);
    expect(options.idle_timeout).toBeGreaterThan(0);
    expect(
      (options.connection as Record<string, unknown> | undefined)
        ?.statement_timeout,
    ).toBeGreaterThan(0);

    // The two are deliberately defined in separate, un-coupled modules (see
    // DB_CONCURRENCY_LIMIT's own comment for why) - this is what keeps them
    // from silently drifting apart instead of just a comment saying so.
    // Same test, not a second `it()`: ./client is only ever evaluated once
    // per file (module caching), so a later test's own import() is a no-op
    // and would see an empty mock-calls list once mocks are cleared between
    // tests.
    expect(options.max).toBe(DB_CONCURRENCY_LIMIT);
  });
});
