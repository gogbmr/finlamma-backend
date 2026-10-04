// Integration test against an in-process PGlite database (src/test/db.ts) -
// proves these aggregate queries actually return correct bounded counts,
// not just that they typecheck. Never touches the real Supabase database
// (see @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { activityLogs, entitlements, lessonProgress, lessons, mentors, sessionTimeDaily, users, worlds } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  countActiveAdFreeEntitlements,
  countDistinctActiveUsersSinceIstDate,
  countLessonsCompletedSince,
  countNewUsersSince,
  countTotalActiveUsers,
  listEntitlementUpdateEventTypesSince,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

let nextOrder = 200_000;
function uniqueOrder() {
  return nextOrder++;
}
function uniqueKey(label: string) {
  return `${label}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

async function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("analytics-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
      ...overrides,
    })
    .returning();
  return user!;
}

async function makeLesson() {
  const [mentor] = await db
    .insert(mentors)
    .values({
      key: uniqueKey("mentor"),
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
      title: { en: "Test World", hi: "x", hx: "x" },
      tagline: { en: "x", hi: "x", hx: "x" },
      theme: "#000000",
      displayXpTarget: 5,
      mentorId: mentor!.id,
    })
    .returning();
  const [lesson] = await db
    .insert(lessons)
    .values({
      worldId: world!.id,
      chapter: 1,
      step: 1,
      kind: "quiz",
      title: { en: "Test Lesson", hi: "x", hx: "x" },
      blurb: { en: "x", hi: "x", hx: "x" },
      content: { questionIds: [] },
    })
    .returning();
  return lesson!;
}

describe("countTotalActiveUsers", () => {
  it("counts non-deleted users only", async () => {
    const deleted = await makeUser();
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, deleted.id));

    const before = await countTotalActiveUsers();
    await makeUser();
    const after = await countTotalActiveUsers();

    expect(after).toBe(before + 1);
  });
});

describe("countNewUsersSince", () => {
  it("only counts users created at or after the given instant", async () => {
    const since = new Date();
    await new Promise((r) => setTimeout(r, 5));
    const countBefore = await countNewUsersSince(since);
    await makeUser();
    const countAfter = await countNewUsersSince(since);

    expect(countAfter).toBe(countBefore + 1);
  });
});

describe("countDistinctActiveUsersSinceIstDate", () => {
  it("counts distinct users with a session_time_daily row on or after the date, not row count", async () => {
    const user = await makeUser();
    await db.insert(sessionTimeDaily).values({ userId: user.id, dateIst: "2026-01-05", seconds: 60 });
    await db.insert(sessionTimeDaily).values({ userId: user.id, dateIst: "2026-01-06", seconds: 60 });

    const count = await countDistinctActiveUsersSinceIstDate("2026-01-01");

    expect(count).toBe(1); // one distinct user, despite two rows
  });

  it("excludes activity before the cutoff date", async () => {
    const before = await countDistinctActiveUsersSinceIstDate("2026-01-01");
    const user = await makeUser();
    await db.insert(sessionTimeDaily).values({ userId: user.id, dateIst: "2020-01-01", seconds: 60 });

    const after = await countDistinctActiveUsersSinceIstDate("2026-01-01");

    expect(after).toBe(before); // the new row is before the cutoff, so the count doesn't move
  });
});

describe("countLessonsCompletedSince", () => {
  it("counts only completed lesson_progress rows at or after the instant", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    const since = new Date();
    await new Promise((r) => setTimeout(r, 5));

    await db.insert(lessonProgress).values({
      userId: user.id,
      lessonId: lesson.id,
      status: "completed",
      completedAt: new Date(),
    });
    await db.insert(lessonProgress).values({
      userId: (await makeUser()).id,
      lessonId: (await makeLesson()).id,
      status: "in_progress",
    });

    const count = await countLessonsCompletedSince(since);

    expect(count).toBe(1);
  });
});

describe("countActiveAdFreeEntitlements", () => {
  it("counts a never-expiring entitlement and excludes an expired one", async () => {
    const now = new Date();
    const activeUser = await makeUser();
    const expiredUser = await makeUser();

    await db.insert(entitlements).values({
      userId: activeUser.id,
      entitlement: "ad_free",
      source: "revenuecat",
      expiresAt: null,
    });
    await db.insert(entitlements).values({
      userId: expiredUser.id,
      entitlement: "ad_free",
      source: "revenuecat",
      expiresAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });

    const count = await countActiveAdFreeEntitlements(now);

    expect(count).toBe(1);
  });
});

describe("listEntitlementUpdateEventTypesSince", () => {
  it("returns only matching-action rows' eventType, within the date window", async () => {
    const since = new Date();
    await new Promise((r) => setTimeout(r, 5));

    await db.insert(activityLogs).values({
      actorType: "system",
      action: "monetisation.entitlement_updated",
      targetType: "entitlements",
      metadata: { eventType: "INITIAL_PURCHASE" },
    });
    await db.insert(activityLogs).values({
      actorType: "system",
      action: "monetisation.entitlement_updated",
      targetType: "entitlements",
      metadata: { eventType: "RENEWAL" },
    });
    await db.insert(activityLogs).values({
      actorType: "system",
      action: "some.other.action",
      metadata: { eventType: "INITIAL_PURCHASE" },
    });

    const eventTypes = await listEntitlementUpdateEventTypesSince(since);

    expect(eventTypes.sort()).toEqual(["INITIAL_PURCHASE", "RENEWAL"]);
  });
});
