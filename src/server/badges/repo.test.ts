// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the unique (user_id, badge_id) idempotency constraint
// actually holds at the database level, the way
// src/server/badges/service.ts's evaluateBadgesForUser relies on it. Never
// touches the real Supabase database (see @/db/client's NODE_ENV=test guard).
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { badges, userBadges, users, vmoneyLedger } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { awardBadgeAndCreditVmoney, insertUserBadgeIfAbsent, listUnlockedBadgeIdsForUser, listUserBadgesForUser } =
  await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("badges-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

async function makeBadge() {
  const [badge] = await db
    .insert(badges)
    .values({
      name: { en: "Pehla Kadam", hi: "x", hx: "x" },
      description: { en: "x", hi: "x", hx: "x" },
      category: "learning",
      criteria: { type: "lessons_completed", threshold: 1 },
      vmReward: 50,
      status: "published",
    })
    .returning();
  return badge;
}

describe("insertUserBadgeIfAbsent", () => {
  it("is idempotent on (userId, badgeId) - a duplicate award is a silent no-op", async () => {
    const user = await makeUser();
    const badge = await makeBadge();

    const first = await insertUserBadgeIfAbsent(user.id, badge.id);
    const second = await insertUserBadgeIfAbsent(user.id, badge.id);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const unlocked = await listUnlockedBadgeIdsForUser(user.id);
    expect(unlocked.size).toBe(1);
    const rows = await listUserBadgesForUser(user.id);
    expect(rows).toHaveLength(1);
  });

  it("lets the same user hold several different badges", async () => {
    const user = await makeUser();
    const badgeA = await makeBadge();
    const badgeB = await makeBadge();

    await insertUserBadgeIfAbsent(user.id, badgeA.id);
    await insertUserBadgeIfAbsent(user.id, badgeB.id);

    const unlocked = await listUnlockedBadgeIdsForUser(user.id);
    expect(unlocked.has(badgeA.id)).toBe(true);
    expect(unlocked.has(badgeB.id)).toBe(true);
  });
});

describe("awardBadgeAndCreditVmoney", () => {
  it("commits the badge award and the VM credit together", async () => {
    const user = await makeUser();
    const badge = await makeBadge();

    const result = await awardBadgeAndCreditVmoney(user.id, badge.id, {
      sourceType: "badge_unlock",
      sourceId: badge.id,
      ruleId: null,
      reason: "Badge unlocked: Pehla Kadam",
      amountPaise: 5000,
      multiplierApplied: 1,
    });

    expect(result?.userBadge).not.toBeNull();
    expect(result?.vmRow?.amountPaise).toBe(5000);
    const unlocked = await listUnlockedBadgeIdsForUser(user.id);
    expect(unlocked.has(badge.id)).toBe(true);
    const [ledgerRow] = await db
      .select()
      .from(vmoneyLedger)
      .where(and(eq(vmoneyLedger.userId, user.id), eq(vmoneyLedger.sourceId, badge.id)));
    expect(ledgerRow?.amountPaise).toBe(5000);
  });

  // Simulates the exact failure a security audit found: a crash between the
  // badge-award write and the VM-credit write, when they were two separate,
  // non-transactional operations. The "crash" is injected via a spy (there's
  // no natural way to make a real process die mid-test on demand), but the
  // transaction, the rollback and every assertion below are 100% real
  // PGlite/Postgres - nothing here is mocked away. This is what actually
  // proves atomicity, not just that the function propagates a rejected
  // promise.
  it("rolls back the badge award too when the VM credit fails - the badge is never left unlocked with no VM paid", async () => {
    const user = await makeUser();
    const badge = await makeBadge();

    const realTransaction = db.transaction.bind(db);
    const transactionSpy = vi
      .spyOn(db, "transaction")
      .mockImplementationOnce((callback: Parameters<typeof db.transaction>[0]) =>
        realTransaction(async (tx) => {
          const realInsert = tx.insert.bind(tx);
          let insertCalls = 0;
          const insertSpy = vi.spyOn(tx, "insert").mockImplementation((table: Parameters<typeof tx.insert>[0]) => {
            insertCalls++;
            if (insertCalls === 2) {
              insertSpy.mockRestore();
              throw new Error("simulated crash before the VM credit commits");
            }
            return realInsert(table);
          });
          return callback(tx);
        }),
      );

    await expect(
      awardBadgeAndCreditVmoney(user.id, badge.id, {
        sourceType: "badge_unlock",
        sourceId: badge.id,
        ruleId: null,
        reason: "Badge unlocked: Pehla Kadam",
        amountPaise: 5000,
        multiplierApplied: 1,
      }),
    ).rejects.toThrow("simulated crash");
    transactionSpy.mockRestore();

    // The badge-award insert happened first, inside the same still-open
    // transaction as the failed VM-credit insert - it must have been rolled
    // back too, or the badge would show unlocked forever with no VM ever paid.
    const unlocked = await listUnlockedBadgeIdsForUser(user.id);
    expect(unlocked.has(badge.id)).toBe(false);
    const rows = await db.select().from(userBadges).where(eq(userBadges.userId, user.id));
    expect(rows).toHaveLength(0);
    const ledgerRows = await db
      .select()
      .from(vmoneyLedger)
      .where(and(eq(vmoneyLedger.userId, user.id), eq(vmoneyLedger.sourceId, badge.id)));
    expect(ledgerRows).toHaveLength(0);
  });
});
