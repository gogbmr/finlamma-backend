// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real FK constraints and ordering/cursor behavior
// actually hold at the database level. Never touches the real Supabase
// database (see @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { lessons, mentors, roles, staffMembers, users, worlds } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  findLessonThread,
  findStandaloneThread,
  getMessageById,
  getThreadById,
  insertMessage,
  insertThread,
  listFlaggedMessagesForReview,
  listMessagesPage,
  listRecentMessages,
  markMessageFlagged,
  markMessageReviewed,
  touchThreadLastMessageAt,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

let nextOrder = 100_000;
function uniqueKey(label: string) {
  return `${label}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("doubt-zone-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

async function makeStaff() {
  const [role] = await db
    .insert(roles)
    .values({ key: uniqueKey("role"), name: "Test Role" })
    .returning();
  const [staff] = await db
    .insert(staffMembers)
    .values({ clerkUserId: uniqueClerkUserId("doubt-zone-repo-staff"), roleId: role.id })
    .returning();
  return staff;
}

async function makeMentor() {
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
  return mentor;
}

async function makeLesson(mentorId: string) {
  const [world] = await db
    .insert(worlds)
    .values({
      order: nextOrder++,
      title: { en: "Test World", hi: "x", hx: "x" },
      tagline: { en: "x", hi: "x", hx: "x" },
      theme: "#000000",
      displayXpTarget: 5,
      mentorId,
    })
    .returning();
  const [lesson] = await db
    .insert(lessons)
    .values({
      worldId: world.id,
      chapter: 1,
      step: 1,
      kind: "doubt_zone",
      title: { en: "Test Lesson", hi: "x", hx: "x" },
      blurb: { en: "x", hi: "x", hx: "x" },
      content: { mentorKey: "", educationalOnlyNote: { en: "x", hi: "x", hx: "x" }, chips: [] },
    })
    .returning();
  return lesson;
}

describe("insertThread / getThreadById", () => {
  it("creates a standalone thread (lessonId null) and reads it back", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();

    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });

    expect(thread.lessonId).toBeNull();
    expect(await getThreadById(thread.id)).toMatchObject({ userId: user.id, mentorId: mentor.id });
  });

  it("returns null for a nonexistent thread id", async () => {
    expect(await getThreadById(randomUUID())).toBeNull();
  });
});

describe("findLessonThread / findStandaloneThread", () => {
  it("finds an existing lesson-scoped thread by (user, lesson) and not by a different lesson", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const lessonA = await makeLesson(mentor.id);
    const lessonB = await makeLesson(mentor.id);

    expect(await findLessonThread(user.id, lessonA.id)).toBeNull();

    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: lessonA.id });

    expect((await findLessonThread(user.id, lessonA.id))?.id).toBe(thread.id);
    expect(await findLessonThread(user.id, lessonB.id)).toBeNull();
  });

  it("finds an existing standalone thread by (user, mentor) with lessonId null, never a lesson-scoped one", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();

    expect(await findStandaloneThread(user.id, mentor.id)).toBeNull();

    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });

    const found = await findStandaloneThread(user.id, mentor.id);
    expect(found?.id).toBe(thread.id);
  });

  it("keeps standalone threads separate per mentor for the same user", async () => {
    const user = await makeUser();
    const mentorA = await makeMentor();
    const mentorB = await makeMentor();
    const threadA = await insertThread({ userId: user.id, mentorId: mentorA.id, lessonId: null });

    expect((await findStandaloneThread(user.id, mentorA.id))?.id).toBe(threadA.id);
    expect(await findStandaloneThread(user.id, mentorB.id)).toBeNull();
  });
});

describe("insertMessage / listRecentMessages / listMessagesPage", () => {
  it("returns recent messages oldest-first, ready to feed the model", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });
    await insertMessage({ threadId: thread.id, role: "learner", content: "first", flagged: false, flaggedReason: null });
    await insertMessage({ threadId: thread.id, role: "assistant", content: "second", flagged: false, flaggedReason: null });
    await insertMessage({ threadId: thread.id, role: "learner", content: "third", flagged: false, flaggedReason: null });

    const recent = await listRecentMessages(thread.id, 20);

    expect(recent.map((m) => m.content)).toEqual(["first", "second", "third"]);
  });

  it("caps history at the given limit, keeping the most recent messages", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });
    for (const content of ["a", "b", "c", "d"]) {
      await insertMessage({ threadId: thread.id, role: "learner", content, flagged: false, flaggedReason: null });
    }

    const recent = await listRecentMessages(thread.id, 2);

    expect(recent.map((m) => m.content)).toEqual(["c", "d"]);
  });

  it("paginates full history newest-first with a before cursor", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });
    for (const content of ["a", "b", "c"]) {
      await insertMessage({ threadId: thread.id, role: "learner", content, flagged: false, flaggedReason: null });
    }

    const firstPage = await listMessagesPage(thread.id, { limit: 2 });
    expect(firstPage.map((m) => m.content)).toEqual(["c", "b"]);

    const secondPage = await listMessagesPage(thread.id, {
      limit: 2,
      before: firstPage[firstPage.length - 1]!.createdAt,
    });
    expect(secondPage.map((m) => m.content)).toEqual(["a"]);
  });
});

describe("markMessageFlagged", () => {
  it("sets flagged, flaggedCategory and flaggedReason on the target message only", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });
    const target = await insertMessage({
      threadId: thread.id,
      role: "learner",
      content: "x",
      flagged: false,
      flaggedReason: null,
    });
    const other = await insertMessage({
      threadId: thread.id,
      role: "learner",
      content: "y",
      flagged: false,
      flaggedReason: null,
    });

    await markMessageFlagged(target.id, "self_harm_or_suicide", "test reason");

    const [flagged, untouched] = await listMessagesPage(thread.id, { limit: 10 });
    const byId = new Map([flagged, untouched].map((m) => [m!.id, m!]));
    expect(byId.get(target.id)?.flagged).toBe(true);
    expect(byId.get(target.id)?.flaggedCategory).toBe("self_harm_or_suicide");
    expect(byId.get(target.id)?.flaggedReason).toBe("test reason");
    expect(byId.get(other.id)?.flagged).toBe(false);
  });

  it("defaults reason to null when omitted", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });
    const target = await insertMessage({
      threadId: thread.id,
      role: "assistant",
      content: "x",
      flagged: false,
      flaggedReason: null,
    });

    await markMessageFlagged(target.id, "learner_reported");

    const [row] = await listMessagesPage(thread.id, { limit: 10 });
    expect(row?.flaggedCategory).toBe("learner_reported");
    expect(row?.flaggedReason).toBeNull();
  });
});

describe("touchThreadLastMessageAt", () => {
  it("bumps lastMessageAt", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });
    const before = thread.lastMessageAt.getTime();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await touchThreadLastMessageAt(thread.id);

    const updated = await getThreadById(thread.id);
    expect(updated!.lastMessageAt.getTime()).toBeGreaterThan(before);
  });
});

describe("getMessageById", () => {
  it("returns null for a nonexistent message", async () => {
    expect(await getMessageById(randomUUID())).toBeNull();
  });

  it("returns the message row", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });
    const message = await insertMessage({
      threadId: thread.id,
      role: "assistant",
      content: "hi",
      flagged: false,
      flaggedReason: null,
    });

    expect(await getMessageById(message.id)).toMatchObject({ threadId: thread.id, role: "assistant" });
  });
});

// listFlaggedMessagesForReview is a global (not thread-scoped) admin query,
// and this file's earlier describe blocks (markMessageFlagged) also leave
// flagged rows behind in the shared PGlite instance - assertions below
// check "contains/excludes this specific row", never "equals exactly this
// array", so they hold regardless of test execution order.
describe("listFlaggedMessagesForReview / markMessageReviewed", () => {
  it("only returns flagged messages (never an unflagged one), joined with the learner's display name and mentor name, never content", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });
    const unflagged = await insertMessage({
      threadId: thread.id,
      role: "learner",
      content: "ordinary",
      flagged: false,
      flaggedReason: null,
    });
    const flagged = await insertMessage({
      threadId: thread.id,
      role: "assistant",
      content: "flagged content",
      flagged: true,
      flaggedCategory: "learner_reported",
      flaggedReason: "some sensitive detail that must never appear in the list",
    });

    const rows = await listFlaggedMessagesForReview({ includeReviewed: true, limit: 500 });
    const ids = rows.map((r) => r.id);

    expect(ids).toContain(flagged.id);
    expect(ids).not.toContain(unflagged.id);
    const row = rows.find((r) => r.id === flagged.id);
    expect(row).toMatchObject({
      firstName: user.firstName,
      lastInitial: user.lastInitial,
      flaggedCategory: "learner_reported",
    });
    expect(row!.mentorName).toEqual(mentor.name);
    expect(row).not.toHaveProperty("content");
    expect(row).not.toHaveProperty("flaggedReason"); // /phase-audit 7: never in the list view
  });

  it("excludes a reviewed message by default, includes it with includeReviewed: true", async () => {
    const user = await makeUser();
    const mentor = await makeMentor();
    const staff = await makeStaff();
    const thread = await insertThread({ userId: user.id, mentorId: mentor.id, lessonId: null });
    const flagged = await insertMessage({
      threadId: thread.id,
      role: "assistant",
      content: "x",
      flagged: true,
      flaggedCategory: "learner_reported",
      flaggedReason: null,
    });

    await markMessageReviewed(flagged.id, staff.id);

    const pending = await listFlaggedMessagesForReview({ includeReviewed: false, limit: 500 });
    expect(pending.map((r) => r.id)).not.toContain(flagged.id);

    const withReviewed = await listFlaggedMessagesForReview({ includeReviewed: true, limit: 500 });
    const row = withReviewed.find((r) => r.id === flagged.id);
    expect(row!.reviewedAt).not.toBeNull();
  });
});
