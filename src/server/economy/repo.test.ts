// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the (userId, sourceType, sourceId) unique constraint
// on xp_events/vmoney_ledger actually enforces "credit once per user per
// source" at the database level, the way docs/ARCHITECTURE.md D26 relies
// on. Never touches the real Supabase database (see @/db/client's
// NODE_ENV=test guard). src/server/economy/service.test.ts covers the
// service layer (activity-kind mapping, successful-completion gating) with
// this repo mocked out.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { rewardRules, users, vmoneyLedger, xpEvents } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  creditLessonCompletionRow,
  getRewardRule,
  listRewardRules,
  sumVmoneyBalance,
  sumVmoneyEarnedSince,
  sumVmoneySpentSince,
  sumXpSince,
  sumXpTotal,
  updateRewardRule,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("economy-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

const [videoRule] = await db
  .insert(rewardRules)
  .values({ activityKind: "video", defaultXp: 20, defaultVm: 30, active: true })
  .returning();

describe("reward_rules", () => {
  it("getRewardRule returns the seeded row for a kind", async () => {
    const rule = await getRewardRule("video");
    expect(rule?.id).toBe(videoRule.id);
  });

  it("getRewardRule returns null for a kind with no row", async () => {
    expect(await getRewardRule("quiz")).toBeNull();
  });

  it("listRewardRules returns every row", async () => {
    const rules = await listRewardRules();
    expect(rules.some((r) => r.activityKind === "video")).toBe(true);
  });

  it("updateRewardRule updates in place, not a new row", async () => {
    const updated = await updateRewardRule("video", { defaultXp: 25, defaultVm: 35, active: true });
    expect(updated?.id).toBe(videoRule.id);
    expect(updated?.defaultXp).toBe(25);
    expect(updated?.defaultVm).toBe(35);

    const rules = await listRewardRules();
    expect(rules.filter((r) => r.activityKind === "video")).toHaveLength(1);
  });
});

describe("creditLessonCompletionRow", () => {
  it("credits both XP and VM for a new (user, lesson) source", async () => {
    const user = await makeUser();
    const lessonId = randomUUID();
    const shared = {
      userId: user.id,
      sourceType: "lesson_completion",
      sourceId: lessonId,
      ruleId: videoRule.id,
      reason: "Lesson completed (video)",
    };

    const { xpRow, vmRow } = await creditLessonCompletionRow(
      { ...shared, amount: 20 },
      { ...shared, amount: 30, multiplierApplied: 1 },
    );

    expect(xpRow?.amount).toBe(20);
    expect(vmRow?.amount).toBe(30);
  });

  it("no-ops (returns null rows) on a repeat credit for the same (user, lesson)", async () => {
    const user = await makeUser();
    const lessonId = randomUUID();
    const shared = {
      userId: user.id,
      sourceType: "lesson_completion",
      sourceId: lessonId,
      ruleId: videoRule.id,
      reason: "Lesson completed (video)",
    };

    const first = await creditLessonCompletionRow(
      { ...shared, amount: 20 },
      { ...shared, amount: 30, multiplierApplied: 1 },
    );
    expect(first.xpRow).not.toBeNull();
    expect(first.vmRow).not.toBeNull();

    const second = await creditLessonCompletionRow(
      { ...shared, amount: 20 },
      { ...shared, amount: 30, multiplierApplied: 1 },
    );
    expect(second.xpRow).toBeNull();
    expect(second.vmRow).toBeNull();
  });

  it("credits the SAME user for two DIFFERENT lessons independently", async () => {
    const user = await makeUser();
    const lessonA = randomUUID();
    const lessonB = randomUUID();
    const base = { userId: user.id, sourceType: "lesson_completion", ruleId: videoRule.id, reason: "x" };

    const a = await creditLessonCompletionRow(
      { ...base, sourceId: lessonA, amount: 20 },
      { ...base, sourceId: lessonA, amount: 30, multiplierApplied: 1 },
    );
    const b = await creditLessonCompletionRow(
      { ...base, sourceId: lessonB, amount: 20 },
      { ...base, sourceId: lessonB, amount: 30, multiplierApplied: 1 },
    );

    expect(a.xpRow).not.toBeNull();
    expect(b.xpRow).not.toBeNull();
  });

  it("credits TWO DIFFERENT users for the SAME lesson independently", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const lessonId = randomUUID();
    const base = { sourceType: "lesson_completion", sourceId: lessonId, ruleId: videoRule.id, reason: "x" };

    const a = await creditLessonCompletionRow(
      { ...base, userId: userA.id, amount: 20 },
      { ...base, userId: userA.id, amount: 30, multiplierApplied: 1 },
    );
    const b = await creditLessonCompletionRow(
      { ...base, userId: userB.id, amount: 20 },
      { ...base, userId: userB.id, amount: 30, multiplierApplied: 1 },
    );

    expect(a.xpRow).not.toBeNull();
    expect(b.xpRow).not.toBeNull();
  });

  it("a reversal (distinct sourceType/sourceId) doesn't conflict with the original credit", async () => {
    const user = await makeUser();
    const lessonId = randomUUID();
    const shared = {
      userId: user.id,
      sourceType: "lesson_completion",
      sourceId: lessonId,
      ruleId: videoRule.id,
      reason: "Lesson completed (video)",
    };
    const credited = await creditLessonCompletionRow(
      { ...shared, amount: 20 },
      { ...shared, amount: 30, multiplierApplied: 1 },
    );
    expect(credited.xpRow).not.toBeNull();

    const reversal = {
      userId: user.id,
      sourceType: "reversal",
      ruleId: null,
      reason: "Reversal of erroneous credit",
    };
    const reversed = await creditLessonCompletionRow(
      { ...reversal, sourceId: credited.xpRow!.id, amount: -20 },
      { ...reversal, sourceId: credited.vmRow!.id, amount: -30, multiplierApplied: 1 },
    );
    expect(reversed.xpRow?.amount).toBe(-20);
    expect(reversed.vmRow?.amount).toBe(-30);
  });
});

describe("ledger sums (WH-03/WH-04 stat endpoints)", () => {
  it("a user with no ledger rows sums to 0 everywhere", async () => {
    const user = await makeUser();

    expect(await sumXpTotal(user.id)).toBe(0);
    expect(await sumXpSince(user.id, new Date("2000-01-01"))).toBe(0);
    expect(await sumVmoneyBalance(user.id)).toBe(0);
    expect(await sumVmoneyEarnedSince(user.id, new Date("2000-01-01"))).toBe(0);
    expect(await sumVmoneySpentSince(user.id, new Date("2000-01-01"))).toBe(0);
  });

  it("sums total XP and VM balance across multiple rows for one user, ignoring other users", async () => {
    const user = await makeUser();
    const other = await makeUser();
    await db.insert(xpEvents).values([
      { userId: user.id, amount: 20, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "x" },
      { userId: user.id, amount: 30, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "x" },
      { userId: other.id, amount: 999, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "x" },
    ]);
    await db.insert(vmoneyLedger).values([
      { userId: user.id, amount: 30, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "x" },
      { userId: user.id, amount: 45, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "x" },
      { userId: other.id, amount: 999, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "x" },
    ]);

    expect(await sumXpTotal(user.id)).toBe(50);
    expect(await sumVmoneyBalance(user.id)).toBe(75);
  });

  it("a reversal (negative amount) nets out of the balance, never deletes or mutates the original row", async () => {
    const user = await makeUser();
    await db.insert(vmoneyLedger).values([
      { userId: user.id, amount: 30, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "x" },
      { userId: user.id, amount: -30, sourceType: "reversal", sourceId: randomUUID(), reason: "reversed" },
    ]);

    expect(await sumVmoneyBalance(user.id)).toBe(0);
  });

  it("sinceDate excludes rows created before it and includes rows at/after it", async () => {
    const user = await makeUser();
    const cutoff = new Date("2026-01-08T00:00:00.000Z");
    await db.insert(xpEvents).values([
      {
        userId: user.id,
        amount: 20,
        sourceType: "lesson_completion",
        sourceId: randomUUID(),
        reason: "old",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        userId: user.id,
        amount: 50,
        sourceType: "lesson_completion",
        sourceId: randomUUID(),
        reason: "recent",
        createdAt: new Date("2026-01-08T00:00:00.000Z"),
      },
    ]);

    expect(await sumXpSince(user.id, cutoff)).toBe(50);
    expect(await sumXpTotal(user.id)).toBe(70);
  });

  it("splits earned and spent by sign within the window, never mixing the two", async () => {
    const user = await makeUser();
    const cutoff = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(vmoneyLedger).values([
      { userId: user.id, amount: 100, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "earn" },
      { userId: user.id, amount: 40, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "earn" },
      { userId: user.id, amount: -25, sourceType: "reversal", sourceId: randomUUID(), reason: "spend" },
    ]);

    expect(await sumVmoneyEarnedSince(user.id, cutoff)).toBe(140);
    expect(await sumVmoneySpentSince(user.id, cutoff)).toBe(25); // reported as a positive magnitude
  });
});
