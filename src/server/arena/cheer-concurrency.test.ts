// Integration test against an in-process PGlite database (src/test/db.ts) -
// the fix for docs/ARCHITECTURE.md D61's cheer daily-cap race: sendCheer now
// locks the receiver's row and wraps insert-cheer + read-caps + credit-XP in
// one transaction, so concurrent cheers from DIFFERENT senders to the SAME
// receiver can no longer each read the daily cap as "not yet reached" and
// each credit past it.
//
// Honesty about what this test can and can't prove (same limitation
// src/server/orders/repo.test.ts already documents for a different
// function): PGlite exposes a SINGLE Postgres connection, so two
// `db.transaction()` calls against one PGlite instance can never genuinely
// interleave - each fully completes before the next one's callback even
// starts. This test therefore can't distinguish "correctly row-locked" from
// "just accidentally wrapped in one transaction with no lock at all" the way
// a real, pooled, multi-connection Postgres could. What it DOES prove,
// honestly: it's a real regression test against the actual bug shape that
// existed before this fix - the OLD code had NO enclosing transaction at
// all (three independent, non-transactional statements: read-the-cap,
// insert-the-cheer, credit-the-XP), so its race window was between separate
// top-level queries, not between two overlapping transactions - and THAT
// shape of race genuinely can (and did, before this fix) manifest even on
// PGlite, since JS's event loop can interleave separately-awaited queries on
// one connection. Reverting sendCheer to that non-transactional shape would
// make this test fail.
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { users, xpEvents } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { sendCheer } = await import("./service");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function makeUser(label: string) {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId(label),
      clerkUpdatedAt: new Date(),
      firstName: "Test",
      lastInitial: "U",
    })
    .returning();
  return user!;
}

async function totalCheerXpFor(userId: string): Promise<number> {
  const rows = await db.select().from(xpEvents).where(eq(xpEvents.userId, userId));
  return rows.filter((r) => r.sourceType === "cheer").reduce((sum, r) => sum + r.amount, 0);
}

const META = { ip: null, userAgent: null };

describe("sendCheer - daily cap under concurrency (docs/ARCHITECTURE.md D61)", () => {
  it("never lets the receiver's daily cheer XP exceed the cap, even with many distinct senders cheering at once", async () => {
    const receiver = await makeUser("cheer-race-receiver");
    // Default settings_kv fallbacks (no row seeded): cheerXpAmount=5,
    // dailyCap=50 - so exactly 10 cheers exhausts the cap. Firing 15
    // DISTINCT senders at once proves the 11th-through-15th are correctly
    // clamped to 0 XP, never allowed to push the total past 50.
    const senderCount = 15;
    const senders = await Promise.all(
      Array.from({ length: senderCount }, (_, i) => makeUser(`cheer-race-sender-${i}`)),
    );

    const results = await Promise.all(senders.map((sender) => sendCheer({ id: sender.id }, receiver.id, META)));

    const totalAwarded = results.reduce((sum, r) => sum + r.xpAwarded, 0);
    const totalInLedger = await totalCheerXpFor(receiver.id);

    expect(totalAwarded).toBeLessThanOrEqual(50);
    expect(totalInLedger).toBeLessThanOrEqual(50);
    expect(totalInLedger).toBe(totalAwarded);
    // Sanity-checks the test actually exercised the cap boundary (some
    // cheers genuinely clamped to 0) rather than just happening to send
    // exactly enough to stay under it by luck.
    expect(results.some((r) => r.xpAwarded === 0 && !r.alreadyCheeredToday)).toBe(true);
  });
});
