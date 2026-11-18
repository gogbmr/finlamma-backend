// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real DB query (filters, date-range validation,
// default ordering, page math) actually behaves correctly. Never touches
// the real Supabase database (see @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { doubtMessages, doubtThreads, mentors, users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { listFlaggedMessagesForAdmin } = await import("./admin-queries");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

let nextOrder = 500_000;
function uniqueKey(label: string) {
  return `${label}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

const [mentor] = await db
  .insert(mentors)
  .values({
    key: uniqueKey("mentor"),
    order: nextOrder++,
    name: { en: "Test Mentor", hi: "x", hx: "x" },
    bio: { en: "x", hi: "x", hx: "x" },
    persona: "test persona",
  })
  .returning();

async function seedFlaggedMessage(overrides: {
  flaggedCategory?:
    | "self_harm_or_suicide"
    | "abuse_or_neglect"
    | "other_wellbeing_concern"
    | "classifier_unavailable"
    | "learner_reported"
    | "advice_language";
  createdAt?: Date;
  reviewed?: boolean;
}) {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("doubt-zone-admin-queries-test"),
      clerkUpdatedAt: new Date(),
      firstName: "Test",
      lastInitial: "T",
    })
    .returning();
  const [thread] = await db
    .insert(doubtThreads)
    .values({ userId: user!.id, mentorId: mentor!.id, lessonId: null })
    .returning();
  const [message] = await db
    .insert(doubtMessages)
    .values({
      threadId: thread!.id,
      role: "learner",
      content: "test message content",
      flagged: true,
      flaggedCategory: overrides.flaggedCategory ?? "learner_reported",
      createdAt: overrides.createdAt ?? new Date(),
      reviewedAt: overrides.reviewed ? new Date() : null,
    })
    .returning();
  return { user: user!, thread: thread!, message: message! };
}

const defaultParams = {
  page: 1,
  pageSize: 20,
  includeReviewed: false,
  flaggedCategory: null,
  flaggedFrom: null,
  flaggedTo: null,
};

describe("listFlaggedMessagesForAdmin", () => {
  it("returns metadata only - never the message content", async () => {
    const { message } = await seedFlaggedMessage({});
    const result = await listFlaggedMessagesForAdmin(defaultParams);
    const row = result.rows.find((r) => r.id === message.id);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("content");
    expect(row).not.toHaveProperty("flaggedReason");
    expect(row).toEqual(
      expect.objectContaining({
        id: message.id,
        role: "learner",
        firstName: "Test",
        lastInitial: "T",
      }),
    );
  });

  it("excludes reviewed messages by default, includes them with includeReviewed", async () => {
    const { message: reviewed } = await seedFlaggedMessage({ reviewed: true });

    const withoutReviewed = await listFlaggedMessagesForAdmin(defaultParams);
    expect(withoutReviewed.rows.map((r) => r.id)).not.toContain(reviewed.id);

    const withReviewed = await listFlaggedMessagesForAdmin({ ...defaultParams, includeReviewed: true });
    expect(withReviewed.rows.map((r) => r.id)).toContain(reviewed.id);
  });

  it("filters by flaggedCategory", async () => {
    const { message: selfHarm } = await seedFlaggedMessage({ flaggedCategory: "self_harm_or_suicide" });
    const { message: advice } = await seedFlaggedMessage({ flaggedCategory: "advice_language" });

    const result = await listFlaggedMessagesForAdmin({
      ...defaultParams,
      flaggedCategory: "self_harm_or_suicide",
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(selfHarm.id);
    expect(ids).not.toContain(advice.id);
  });

  it("filters by flagged date range", async () => {
    const { message: inRange } = await seedFlaggedMessage({
      createdAt: new Date("2026-06-15T00:00:00.000Z"),
    });
    const { message: outOfRange } = await seedFlaggedMessage({
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const result = await listFlaggedMessagesForAdmin({
      ...defaultParams,
      flaggedFrom: new Date("2026-06-01T00:00:00.000Z"),
      flaggedTo: new Date("2026-06-30T00:00:00.000Z"),
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(inRange.id);
    expect(ids).not.toContain(outOfRange.id);
  });

  it("defaults to createdAt descending (newest flag first), same as today", async () => {
    const { message: older } = await seedFlaggedMessage({
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const { message: newer } = await seedFlaggedMessage({
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    const result = await listFlaggedMessagesForAdmin({ ...defaultParams, pageSize: 100 });

    const olderIndex = result.rows.findIndex((r) => r.id === older.id);
    const newerIndex = result.rows.findIndex((r) => r.id === newer.id);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  it("clamps page to the last valid page and reports an accurate total/pageCount", async () => {
    const result = await listFlaggedMessagesForAdmin({ ...defaultParams, page: 999, pageSize: 5 });
    expect(result.page).toBe(result.pageCount);
    expect(result.rows.length).toBeLessThanOrEqual(5);
    expect(result.total).toBeGreaterThan(0);
  });
});
