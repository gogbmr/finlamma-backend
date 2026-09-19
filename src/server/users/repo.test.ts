// Integration tests: these run against an in-process PGlite database
// (src/test/db.ts) instead of mocking `db`, because the behavior under
// test - Postgres's ON CONFLICT ... WHERE clause silently ignoring
// stale/duplicate events - can't be observed through a mock. They never
// touch the real Supabase database (see @/db/client's NODE_ENV=test guard).
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId, uniqueEmail } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { anonymizeUserFromClerk, upsertUserFromClerk } = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

describe("upsertUserFromClerk / anonymizeUserFromClerk", () => {
  it("is idempotent under a duplicate webhook delivery", async () => {
    const clerkUserId = uniqueClerkUserId("idempotent");
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
    const clerkUserId = uniqueClerkUserId("resurrect");
    await upsertUserFromClerk({
      clerkUserId,
      firstName: "Test",
      lastInitial: "U",
      email: uniqueEmail("resurrect-before"),
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
      email: uniqueEmail("resurrect-after"),
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
    const clerkUserId = uniqueClerkUserId("phone-only");
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
    const clerkUserId = uniqueClerkUserId("dup");
    const otherClerkUserId = uniqueClerkUserId("dup-other");
    const email = uniqueEmail("duplicate");
    await upsertUserFromClerk({
      clerkUserId: otherClerkUserId,
      firstName: "First",
      lastInitial: "U",
      email,
      phone: null,
      clerkUpdatedAt: new Date(),
    });

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
  });
});
