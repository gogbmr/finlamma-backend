// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the unique (user_id, badge_id) idempotency constraint
// actually holds at the database level, the way
// src/server/badges/service.ts's evaluateBadgesForUser relies on it. Never
// touches the real Supabase database (see @/db/client's NODE_ENV=test guard).
import { afterAll, describe, expect, it, vi } from "vitest";
import { badges, users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { insertUserBadgeIfAbsent, listUnlockedBadgeIdsForUser, listUserBadgesForUser } = await import("./repo");
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
