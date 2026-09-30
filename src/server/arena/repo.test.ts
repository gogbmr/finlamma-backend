// Integration tests against an in-process PGlite database (src/test/db.ts) -
// the world-attribution logic here (MAX(order) joined back to worlds) is a
// real SQL query worth proving against real Postgres, not just a mocked
// unit test of the service layer that calls it. Never touches the real
// Supabase database (see @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  cheers,
  leaderboardSnapshots,
  lessonProgress,
  lessons,
  mentors,
  users,
  worldXpSnapshots,
  worlds,
  xpEvents,
} from "@/db/schema";
import { istDateString } from "@/lib/ist-date";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  countCheersReceivedSince,
  deleteAboutMeChipRow,
  ensureLeague,
  getCurrentWorldIdForUser,
  getLastWeekRanksForScope,
  getLeagueZonesForScope,
  getSelectedChipsForUser,
  getSnapshotEntryForUser,
  insertAboutMeChip,
  insertCheerIfNew,
  insertLeagueSettlementIfNew,
  replaceLeagueMembers,
  replaceUserChipSelection,
  sumCheerXpCreditedToday,
  sumCheerXpFromSenderToReceiverSince,
  upsertLeaderboardSnapshotIfNew,
  upsertWorldXpSnapshotsForDate,
  weeklyXpByScope,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

let nextOrder = 100_000;
function uniqueOrder() {
  return nextOrder++;
}
function uniqueKey() {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: uniqueClerkUserId("arena-repo-user"), clerkUpdatedAt: new Date(), firstName: "Test" })
    .returning();
  return user;
}

async function makeWorld(status: "draft" | "published" = "published") {
  const [mentor] = await db
    .insert(mentors)
    .values({
      key: `mentor_${uniqueKey()}`,
      order: uniqueOrder(),
      name: { en: "Test Mentor", hi: "x", hx: "x" },
      bio: { en: "x", hi: "x", hx: "x" },
      persona: "test persona",
    })
    .returning();
  const [world] = await db
    .insert(worlds)
    .values({
      order: uniqueOrder(),
      title: { en: `World ${uniqueKey()}`, hi: "x", hx: "x" },
      tagline: { en: "x", hi: "x", hx: "x" },
      theme: "#000000",
      displayXpTarget: 5,
      mentorId: mentor.id,
      status,
    })
    .returning();
  return world;
}

async function makeLesson(worldId: string) {
  const [lesson] = await db
    .insert(lessons)
    .values({
      worldId,
      chapter: 1,
      step: 1,
      kind: "quiz",
      title: { en: "Test Lesson", hi: "x", hx: "x" },
      blurb: { en: "x", hi: "x", hx: "x" },
      content: { questionIds: [] },
    })
    .returning();
  return lesson;
}

async function completeLesson(userId: string, lessonId: string) {
  await db.insert(lessonProgress).values({
    userId,
    lessonId,
    status: "completed",
    completedAt: new Date(),
  });
}

async function creditXp(userId: string, amount: number, createdAt: Date) {
  await db.insert(xpEvents).values({
    userId,
    amount,
    sourceType: "test",
    sourceId: randomUUID(),
    ruleId: null,
    reason: "test credit",
    createdAt,
  });
}

describe("getCurrentWorldIdForUser", () => {
  it("defaults to the lowest-order published world when the learner has no completions yet", async () => {
    const user = await makeUser();
    const worldA = await makeWorld();
    await makeWorld(); // a second, higher-order published world - should NOT be picked

    const result = await getCurrentWorldIdForUser(user.id);

    expect(result).toBe(worldA.id);
  });

  it("returns the highest-order world with a completed lesson, not the first one completed", async () => {
    const user = await makeUser();
    const worldLow = await makeWorld();
    const worldHigh = await makeWorld();
    const lessonInLowWorld = await makeLesson(worldLow.id);
    const lessonInHighWorld = await makeLesson(worldHigh.id);

    // Completed out of order - the low-order world's lesson finished LAST -
    // the result must still be the higher-order world.
    await completeLesson(user.id, lessonInHighWorld.id);
    await completeLesson(user.id, lessonInLowWorld.id);

    const result = await getCurrentWorldIdForUser(user.id);

    expect(result).toBe(worldHigh.id);
  });

  it("ignores an in_progress (not completed) lesson", async () => {
    const user = await makeUser();
    const worldB = await makeWorld();
    const lessonInB = await makeLesson(worldB.id);
    await db.insert(lessonProgress).values({ userId: user.id, lessonId: lessonInB.id, status: "in_progress" });

    const result = await getCurrentWorldIdForUser(user.id);

    // Falls back to SOME published world (never null, a published catalog
    // exists), but never the in-progress-only world - other tests in this
    // file also create published worlds sharing the same PGlite instance,
    // so this deliberately doesn't assert exactly which fallback world wins.
    expect(result).not.toBe(worldB.id);
    expect(result).not.toBeNull();
  });
});

describe("weeklyXpByScope (world)", () => {
  it("sums XP only for learners currently attributed to that world", async () => {
    const worldA = await makeWorld();
    const worldB = await makeWorld();
    const lessonA = await makeLesson(worldA.id);
    const lessonB = await makeLesson(worldB.id);

    const userInA = await makeUser();
    const userInB = await makeUser();
    await completeLesson(userInA.id, lessonA.id);
    await completeLesson(userInB.id, lessonB.id);

    const now = new Date();
    const weekStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await creditXp(userInA.id, 40, now);
    await creditXp(userInB.id, 999, now); // must not leak into world A's total

    const rows = await weeklyXpByScope({ kind: "world", worldId: worldA.id }, weekStart);

    expect(rows).toEqual([{ userId: userInA.id, xp: 40 }]);
  });

  it("excludes XP earned before weekStartUtc", async () => {
    const world = await makeWorld();
    const lesson = await makeLesson(world.id);
    const user = await makeUser();
    await completeLesson(user.id, lesson.id);

    const weekStart = new Date();
    await creditXp(user.id, 100, new Date(weekStart.getTime() - 60_000)); // before the window

    const rows = await weeklyXpByScope({ kind: "world", worldId: world.id }, weekStart);

    expect(rows).toEqual([]);
  });
});

describe("upsertWorldXpSnapshotsForDate", () => {
  it("is idempotent - a retried run for the same date overwrites rather than double-writing", async () => {
    const world = await makeWorld();
    const lesson = await makeLesson(world.id);
    const user = await makeUser();
    await completeLesson(user.id, lesson.id);
    const today = new Date();
    await creditXp(user.id, 30, today);

    const dateIst = istDateString(today); // must match the repo function's own IST day boundary
    await upsertWorldXpSnapshotsForDate(dateIst);
    await creditXp(user.id, 20, today); // more XP credited before the retry
    await upsertWorldXpSnapshotsForDate(dateIst); // simulated retry, same date

    const rows = await db
      .select()
      .from(worldXpSnapshots)
      .where(eq(worldXpSnapshots.worldId, world.id));

    expect(rows).toHaveLength(1); // never a duplicate row for the same (world, date)
  });
});

describe("insertCheerIfNew", () => {
  it("is idempotent per (sender, receiver, day) - a same-day repeat is a no-op, not a duplicate row", async () => {
    const sender = await makeUser();
    const receiver = await makeUser();
    const today = istDateString(new Date());

    const first = await insertCheerIfNew(sender.id, receiver.id, today);
    const second = await insertCheerIfNew(sender.id, receiver.id, today);

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const rows = await db.select().from(cheers).where(eq(cheers.senderId, sender.id));
    expect(rows).toHaveLength(1);
  });

  it("allows the same sender to cheer a different receiver the same day", async () => {
    const sender = await makeUser();
    const receiverA = await makeUser();
    const receiverB = await makeUser();
    const today = istDateString(new Date());

    const first = await insertCheerIfNew(sender.id, receiverA.id, today);
    const second = await insertCheerIfNew(sender.id, receiverB.id, today);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });
});

describe("sumCheerXpCreditedToday / countCheersReceivedSince", () => {
  it("sums only cheer-sourced XP for today, and counts cheers received since a given instant", async () => {
    const sender = await makeUser();
    const receiver = await makeUser();
    const today = istDateString(new Date());
    const cheerRow = await insertCheerIfNew(sender.id, receiver.id, today);

    await db.insert(xpEvents).values({
      userId: receiver.id,
      amount: 5,
      sourceType: "cheer",
      sourceId: cheerRow!.id,
      ruleId: null,
      reason: "Cheer received",
    });
    // A non-cheer XP credit the same day must not count toward the cheer cap.
    await creditXp(receiver.id, 999, new Date());

    const cheerXpToday = await sumCheerXpCreditedToday(receiver.id, today);
    expect(cheerXpToday).toBe(5);

    const sinceLongAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const receivedCount = await countCheersReceivedSince(receiver.id, sinceLongAgo);
    expect(receivedCount).toBe(1);
  });
});

describe("about-me chips: selection replace + delete-while-in-use", () => {
  it("replaceUserChipSelection replaces the whole set atomically, not merges", async () => {
    const user = await makeUser();
    const chipA = await insertAboutMeChip({ name: { en: "Saver", hi: "x", hx: "x" }, iconKey: null, active: true });
    const chipB = await insertAboutMeChip({ name: { en: "Trader", hi: "x", hx: "x" }, iconKey: null, active: true });

    await replaceUserChipSelection(user.id, [chipA.id]);
    let selected = await getSelectedChipsForUser(user.id);
    expect(selected.map((c) => c.id)).toEqual([chipA.id]);

    await replaceUserChipSelection(user.id, [chipB.id]);
    selected = await getSelectedChipsForUser(user.id);
    expect(selected.map((c) => c.id)).toEqual([chipB.id]); // chipA is gone, not still present

    await replaceUserChipSelection(user.id, []);
    selected = await getSelectedChipsForUser(user.id);
    expect(selected).toEqual([]);
  });

  it("refuses to delete a chip currently selected by a learner (FK restrict)", async () => {
    const user = await makeUser();
    const chip = await insertAboutMeChip({ name: { en: "Saver", hi: "x", hx: "x" }, iconKey: null, active: true });
    await replaceUserChipSelection(user.id, [chip.id]);

    await expect(deleteAboutMeChipRow(chip.id)).rejects.toThrow();
  });
});

describe("ensureLeague / replaceLeagueMembers / getLeagueZonesForScope", () => {
  it("get-or-creates a league row for a scope, idempotently", async () => {
    const scope = `test-scope-${uniqueKey()}`;

    const first = await ensureLeague(scope);
    const second = await ensureLeague(scope);

    expect(second.id).toBe(first.id);
  });

  it("replaces the whole membership, not merges", async () => {
    const scope = `test-scope-${uniqueKey()}`;
    const league = await ensureLeague(scope);
    const u1 = await makeUser();
    const u2 = await makeUser();

    await replaceLeagueMembers(league.id, [{ userId: u1.id, zone: "promote", rank: 1 }]);
    let zones = await getLeagueZonesForScope(scope);
    expect(zones.get(u1.id)).toBe("promote");
    expect(zones.has(u2.id)).toBe(false);

    await replaceLeagueMembers(league.id, [{ userId: u2.id, zone: "demote", rank: 1 }]);
    zones = await getLeagueZonesForScope(scope);
    expect(zones.has(u1.id)).toBe(false); // u1 is gone, not still present
    expect(zones.get(u2.id)).toBe("demote");
  });
});

describe("upsertLeaderboardSnapshotIfNew / getLastWeekRanksForScope", () => {
  it("never overwrites once written for the same (week, scope) - a retry with different numbers is a no-op", async () => {
    const scope = `test-scope-${uniqueKey()}`;
    const user = await makeUser();
    await upsertLeaderboardSnapshotIfNew({
      weekStartDate: "2026-01-05",
      scope,
      poolSize: 1,
      rankings: [{ userId: user.id, rank: 1, xp: 100, zone: "promote", prevRank: null }],
    });

    await upsertLeaderboardSnapshotIfNew({
      weekStartDate: "2026-01-05",
      scope,
      poolSize: 99,
      rankings: [{ userId: user.id, rank: 1, xp: 999, zone: "demote", prevRank: null }],
    });

    const rows = await db.select().from(leaderboardSnapshots).where(eq(leaderboardSnapshots.scope, scope));
    expect(rows).toHaveLength(1);
    expect(rows[0].poolSize).toBe(1);
  });

  it("reads back a stored week's ranks by userId, and nothing for a week never written", async () => {
    const scope = `test-scope-${uniqueKey()}`;
    const user = await makeUser();
    await upsertLeaderboardSnapshotIfNew({
      weekStartDate: "2026-01-05",
      scope,
      poolSize: 1,
      rankings: [{ userId: user.id, rank: 7, xp: 100, zone: "safe", prevRank: null }],
    });

    expect((await getLastWeekRanksForScope(scope, "2026-01-05")).get(user.id)).toBe(7);
    expect((await getLastWeekRanksForScope(scope, "2026-01-12")).size).toBe(0);
  });
});

describe("insertLeagueSettlementIfNew", () => {
  // `db as never` below: insertLeagueSettlementIfNew's DbOrTx type is derived
  // from the real (postgres-js) db singleton, structurally identical at
  // runtime to PGlite's db (both plain Drizzle query builders) but seen as
  // two different driver types by TypeScript - a test-only type
  // reconciliation, same pattern src/server/economy/repo.test.ts already uses.
  it("is idempotent per (userId, weekStartDate) - a retry with different numbers is a no-op, not a duplicate row", async () => {
    const user = await makeUser();
    const input = {
      userId: user.id,
      weekStartDate: "2026-01-05",
      scope: "global",
      zone: "promote" as const,
      xp: 100,
      vmAwarded: 500,
    };

    const first = await insertLeagueSettlementIfNew(db as never, input);
    const second = await insertLeagueSettlementIfNew(db as never, { ...input, vmAwarded: 999 });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("allows the same user to be settled again for a different week", async () => {
    const user = await makeUser();

    const first = await insertLeagueSettlementIfNew(db as never, {
      userId: user.id,
      weekStartDate: "2026-01-05",
      scope: "global",
      zone: "promote",
      xp: 100,
      vmAwarded: 500,
    });
    const second = await insertLeagueSettlementIfNew(db as never, {
      userId: user.id,
      weekStartDate: "2026-01-12",
      scope: "global",
      zone: "safe",
      xp: 50,
      vmAwarded: 0,
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });
});

describe("sumCheerXpFromSenderToReceiverSince", () => {
  it("sums only XP from cheers between this exact sender-receiver pair", async () => {
    const sender = await makeUser();
    const receiver = await makeUser();
    const otherSender = await makeUser();
    const today = istDateString(new Date());

    const cheer1 = await insertCheerIfNew(sender.id, receiver.id, today);
    await db.insert(xpEvents).values({
      userId: receiver.id,
      amount: 5,
      sourceType: "cheer",
      sourceId: cheer1!.id,
      ruleId: null,
      reason: "Cheer received",
    });
    // A different sender cheering the same receiver must not count toward THIS pair's cap.
    const cheer2 = await insertCheerIfNew(otherSender.id, receiver.id, today);
    await db.insert(xpEvents).values({
      userId: receiver.id,
      amount: 5,
      sourceType: "cheer",
      sourceId: cheer2!.id,
      ruleId: null,
      reason: "Cheer received",
    });

    const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const sum = await sumCheerXpFromSenderToReceiverSince(sender.id, receiver.id, longAgo);

    expect(sum).toBe(5);
  });
});

describe("getSnapshotEntryForUser", () => {
  it("returns null when the scope never settled that week (no snapshot row at all)", async () => {
    const scope = `test-scope-${uniqueKey()}`;

    const result = await getSnapshotEntryForUser(scope, "2026-01-05", "any-user");

    expect(result).toBeNull();
  });

  it("returns null when the scope settled but this learner had no XP that week", async () => {
    const scope = `test-scope-${uniqueKey()}`;
    const rankedUser = await makeUser();
    const unrankedUser = await makeUser();
    await upsertLeaderboardSnapshotIfNew({
      weekStartDate: "2026-01-05",
      scope,
      poolSize: 1,
      rankings: [{ userId: rankedUser.id, rank: 1, xp: 100, zone: "promote", prevRank: null }],
    });

    const result = await getSnapshotEntryForUser(scope, "2026-01-05", unrankedUser.id);

    expect(result).toBeNull();
  });

  it("returns the entry's rank, the snapshot's poolSize, and prevRank when the learner is in it", async () => {
    const scope = `test-scope-${uniqueKey()}`;
    const user = await makeUser();
    await upsertLeaderboardSnapshotIfNew({
      weekStartDate: "2026-01-05",
      scope,
      poolSize: 240,
      rankings: [{ userId: user.id, rank: 8, xp: 500, zone: "promote", prevRank: 20 }],
    });

    const result = await getSnapshotEntryForUser(scope, "2026-01-05", user.id);

    expect(result).toEqual({ rank: 8, poolSize: 240, prevRank: 20 });
  });
});
