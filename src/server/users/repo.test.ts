// Integration tests: these hit the real dev Supabase database instead of
// mocking `db`, because the behavior under test - Postgres's
// ON CONFLICT ... WHERE clause silently ignoring stale/duplicate events -
// can't be observed through a mock.  Each test cleans up its own row.
//
// @/db/client validates env vars at import time, but Vitest sets
// NODE_ENV=test, and @next/env deliberately skips .env.local when
// NODE_ENV=test (it looks for .env.test.local/.env.test instead, per
// Next's own docs) - so it never gets loaded here automatically the way
// envConfig.ts loads it for scripts/drizzle-kit. Load it directly with
// Node's built-in loader, then import anything env-dependent dynamically
// so it happens afterwards (static imports are hoisted above this).
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { users } from "@/db/schema";

process.loadEnvFile(".env.local");
const { db } = await import("@/db/client");
const { anonymizeUserFromClerk, upsertUserFromClerk } = await import("./repo");

describe("upsertUserFromClerk / anonymizeUserFromClerk", () => {
  const clerkUserId = `repo-test-${Date.now()}`;

  afterEach(async () => {
    await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
  });

  it("is idempotent under a duplicate webhook delivery", async () => {
    const input = {
      clerkUserId,
      firstName: "Test",
      lastInitial: "U",
      email: null,
      phone: null,
      clerkUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    };

    await upsertUserFromClerk(input);
    await upsertUserFromClerk(input); // redelivery of the exact same event

    const rows = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Test");
  });

  it("cannot resurrect personal data with a user.updated that arrives after user.deleted", async () => {
    await upsertUserFromClerk({
      clerkUserId,
      firstName: "Test",
      lastInitial: "U",
      email: "test@example.com",
      phone: null,
      clerkUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    await anonymizeUserFromClerk(clerkUserId);

    // Even a clerkUpdatedAt newer than anything seen so far must not apply,
    // because the row is deleted - deletedAt IS NULL is an unconditional
    // guard, not just a staleness check.
    await upsertUserFromClerk({
      clerkUserId,
      firstName: "Resurrected",
      lastInitial: "U",
      email: "resurrected@example.com",
      phone: null,
      clerkUpdatedAt: new Date("2026-06-01T00:00:00Z"),
    });

    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(row.deletedAt).not.toBeNull();
    expect(row.firstName).toBe("Deleted user");
    expect(row.lastInitial).toBeNull();
    expect(row.email).toBeNull();
  });

  it("allows null firstName/lastInitial for a phone-only signup with no name yet", async () => {
    await upsertUserFromClerk({
      clerkUserId,
      firstName: null,
      lastInitial: null,
      email: null,
      phone: "+911234567890",
      clerkUpdatedAt: new Date(),
    });

    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(row.firstName).toBeNull();
    expect(row.lastInitial).toBeNull();
    expect(row.phone).toBe("+911234567890");
  });

  it("scrubs the raw Postgres error on a duplicate email instead of leaking it", async () => {
    const otherClerkUserId = `${clerkUserId}-other`;
    const email = `${clerkUserId}@example.com`;
    await upsertUserFromClerk({
      clerkUserId: otherClerkUserId,
      firstName: "First",
      lastInitial: "U",
      email,
      phone: null,
      clerkUpdatedAt: new Date(),
    });

    try {
      await expect(
        upsertUserFromClerk({
          clerkUserId,
          firstName: "Second",
          lastInitial: "U",
          email, // already taken by otherClerkUserId
          phone: null,
          clerkUpdatedAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      await db.delete(users).where(eq(users.clerkUserId, otherClerkUserId));
    }
  });
});
