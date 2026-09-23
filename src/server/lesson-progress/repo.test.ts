// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the atomic time-gated UPDATE in
// completeUngradedLessonProgressIfEligible actually enforces "at least N
// seconds since startedAt" at the database level (docs/ECONOMY.md decision
// 4's Story/Doubt Zone completion rule), not just in application code.
// Never touches the real Supabase database (see @/db/client's NODE_ENV=test
// guard). src/server/lesson-progress/service.test.ts covers the service
// layer (settings lookup, error shapes) with this repo mocked out.
import { mentors, users, worlds, lessons } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  completeUngradedLessonProgressIfEligible,
  getLessonProgress,
  startLessonProgress,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

let nextOrder = 200_000;
function uniqueOrder() {
  return nextOrder++;
}

async function makeUser() {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("lesson-progress-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

async function makeLesson(kind: "story" | "doubt_zone" = "story") {
  const [mentor] = await db
    .insert(mentors)
    .values({
      key: `mentor_${uniqueOrder()}`,
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
      mentorId: mentor.id,
    })
    .returning();
  const [lesson] = await db
    .insert(lessons)
    .values({
      worldId: world.id,
      chapter: 1,
      step: 1,
      kind,
      title: { en: "Test Lesson", hi: "x", hx: "x" },
      blurb: { en: "x", hi: "x", hx: "x" },
      content: {},
    })
    .returning();
  return lesson;
}

describe("startLessonProgress / getLessonProgress", () => {
  it("starts a row, and a re-serve returns the same startedAt, never a new one", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();

    const first = await startLessonProgress(user.id, lesson.id);
    expect(first?.status).toBe("in_progress");

    const second = await startLessonProgress(user.id, lesson.id); // idempotent re-serve
    expect(second).toBeNull(); // onConflictDoNothing - caller falls back to getLessonProgress

    const row = await getLessonProgress(user.id, lesson.id);
    expect(row?.startedAt.getTime()).toBe(first!.startedAt.getTime());
  });
});

describe("completeUngradedLessonProgressIfEligible", () => {
  it("does NOT complete when the minimum time hasn't elapsed yet (instant-complete rejected)", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    await startLessonProgress(user.id, lesson.id);

    // minStartedAt in the past relative to "now", but AFTER the real
    // startedAt (which is "now", just inserted) - i.e. not enough time has
    // elapsed. A real 150s-minimum check would compute
    // `minStartedAt = now - 150s`; here we simulate "not enough elapsed"
    // by requiring startedAt to be at or before 1 hour ago, which the
    // just-inserted row obviously isn't.
    const minStartedAt = new Date(Date.now() - 60 * 60 * 1000);

    const result = await completeUngradedLessonProgressIfEligible(user.id, lesson.id, minStartedAt);

    expect(result).toBeNull();
    const row = await getLessonProgress(user.id, lesson.id);
    expect(row?.status).toBe("in_progress");
  });

  it("completes once the minimum time has genuinely elapsed", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    await startLessonProgress(user.id, lesson.id);

    // Require only that startedAt is at or before "now" (trivially true,
    // simulating "enough time has elapsed").
    const minStartedAt = new Date();

    const result = await completeUngradedLessonProgressIfEligible(user.id, lesson.id, minStartedAt);

    expect(result?.status).toBe("completed");
    expect(result?.completedAt).not.toBeNull();
  });

  it("does NOT complete again once already completed (double-complete no-ops)", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    await startLessonProgress(user.id, lesson.id);
    const minStartedAt = new Date();
    const firstCompletion = await completeUngradedLessonProgressIfEligible(user.id, lesson.id, minStartedAt);
    expect(firstCompletion?.status).toBe("completed");

    const secondCompletion = await completeUngradedLessonProgressIfEligible(user.id, lesson.id, minStartedAt);

    expect(secondCompletion).toBeNull(); // WHERE status='in_progress' no longer matches
  });

  it("returns null when the lesson was never served at all", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();

    const result = await completeUngradedLessonProgressIfEligible(user.id, lesson.id, new Date());

    expect(result).toBeNull();
  });
});
