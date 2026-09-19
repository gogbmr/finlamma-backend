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

  it("anonymizing a clerk_user_id we've never seen is a safe no-op, not an error", async () => {
    // Clerk's "Send Example" test events use a different fake user id per
    // event type, so a user.deleted can arrive for an id with no matching
    // row. Postgres's UPDATE with a WHERE clause matching zero rows is a
    // normal success (0 rows affected), never a thrown error - this test
    // pins that down instead of relying on it accidentally staying true.
    await expect(
      anonymizeUserFromClerk(uniqueClerkUserId("never-seen")),
    ).resolves.toBeUndefined();
  });

  it("upserting a clerk_user_id we've never seen creates a new row, not an error", async () => {
    // Same reasoning for user.updated: INSERT ... ON CONFLICT DO UPDATE
    // with no existing row just inserts a fresh one.
    const clerkUserId = uniqueClerkUserId("updated-first");
    await upsertUserFromClerk({
      clerkUserId,
      firstName: "New",
      lastInitial: "U",
      email: null,
      phone: null,
      clerkUpdatedAt: new Date(),
    });

    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(row.firstName).toBe("New");
  });

  it("runs the full lifecycle: created, then updated, then deleted and anonymized", async () => {
    const clerkUserId = uniqueClerkUserId("lifecycle");

    await upsertUserFromClerk({
      clerkUserId,
      firstName: "Original",
      lastInitial: "U",
      email: uniqueEmail("lifecycle"),
      phone: null,
      clerkUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    let [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(row.firstName).toBe("Original");
    expect(row.deletedAt).toBeNull();

    await upsertUserFromClerk({
      clerkUserId,
      firstName: "Updated",
      lastInitial: "U",
      email: uniqueEmail("lifecycle-updated"),
      phone: null,
      clerkUpdatedAt: new Date("2026-02-01T00:00:00Z"),
    });
    [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(row.firstName).toBe("Updated");
    expect(row.deletedAt).toBeNull();

    await anonymizeUserFromClerk(clerkUserId);
    [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    expect(row.firstName).toBe("Deleted user");
    expect(row.lastInitial).toBeNull();
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.deletedAt).not.toBeNull();
  });
});
