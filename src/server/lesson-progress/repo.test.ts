// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the unique (user_id, lesson_id) constraint, the
// never-downgrade-on-conflict behavior, and (Phase 3 Checkpoint 3) the
// atomic time-gated UPDATE in completeUngradedLessonProgressIfEligible
// actually hold at the database level. Never touches the real Supabase
// database (see @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { lessons, mentors, users, worlds } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  completeLessonProgress,
  completeUngradedLessonProgressIfEligible,
  countInProgressLearners,
  countInProgressLearnersByLessonIds,
  getLessonProgress,
  startLessonProgress,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

let nextOrder = 100_000;
function uniqueOrder() {
  return nextOrder++;
}
function uniqueKey(label: string) {
  return `${label}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
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

async function makeLesson(overrides: Partial<Record<string, unknown>> = {}) {
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
      mentorId: mentor.id,
    })
    .returning();
  const [lesson] = await db
    .insert(lessons)
    .values({
      worldId: world.id,
      chapter: 1,
      step: 1,
      kind: "quiz",
      title: { en: "Test Lesson", hi: "x", hx: "x" },
      blurb: { en: "x", hi: "x", hx: "x" },
      content: { questionIds: [] },
      ...overrides,
    })
    .returning();
  return { lesson, world };
}

describe("startLessonProgress", () => {
  it("creates an in_progress row", async () => {
    const user = await makeUser();
    const { lesson } = await makeLesson();

    const row = await startLessonProgress(user.id, lesson.id);

    expect(row?.status).toBe("in_progress");
  });

  it("is a no-op (returns null) if a row already exists - never downgrades a completed row", async () => {
    const user = await makeUser();
    const { lesson } = await makeLesson();
    await startLessonProgress(user.id, lesson.id);
    await completeLessonProgress(user.id, lesson.id);

    const result = await startLessonProgress(user.id, lesson.id);

    expect(result).toBeNull();
    expect(await countInProgressLearners(lesson.id)).toBe(0); // still completed, not in_progress
  });

  it("rejects a nonexistent lessonId (FK violation)", async () => {
    const user = await makeUser();
    await expect(startLessonProgress(user.id, randomUUID())).rejects.toThrow();
  });
});

describe("getLessonProgress", () => {
  it("returns null when no row exists", async () => {
    const user = await makeUser();
    const { lesson } = await makeLesson();

    expect(await getLessonProgress(user.id, lesson.id)).toBeNull();
  });

  it("a re-serve returns the same startedAt as the original serve, never a new one", async () => {
    const user = await makeUser();
    const { lesson } = await makeLesson({ kind: "story" });

    const first = await startLessonProgress(user.id, lesson.id);
    const second = await startLessonProgress(user.id, lesson.id); // idempotent re-serve
    expect(second).toBeNull(); // onConflictDoNothing - caller falls back to getLessonProgress

    const row = await getLessonProgress(user.id, lesson.id);
    expect(row?.startedAt.getTime()).toBe(first!.startedAt.getTime());
  });
});

describe("completeLessonProgress", () => {
  it("marks a started lesson completed, stamping completedAt", async () => {
    const user = await makeUser();
    const { lesson } = await makeLesson();
    await startLessonProgress(user.id, lesson.id);

    const completed = await completeLessonProgress(user.id, lesson.id);

    expect(completed?.status).toBe("completed");
    expect(completed?.completedAt).toBeInstanceOf(Date);
  });

  it("is a harmless no-op when called again on an already-completed row", async () => {
    const user = await makeUser();
    const { lesson } = await makeLesson();
    await startLessonProgress(user.id, lesson.id);
    await completeLessonProgress(user.id, lesson.id);

    const second = await completeLessonProgress(user.id, lesson.id);

    expect(second?.status).toBe("completed");
  });
});

describe("completeUngradedLessonProgressIfEligible (Phase 3 Checkpoint 3)", () => {
  it("does NOT complete when the minimum time hasn't elapsed yet (instant-complete rejected)", async () => {
    const user = await makeUser();
    const { lesson } = await makeLesson({ kind: "story" });
    await startLessonProgress(user.id, lesson.id);

    // Require startedAt to be at or before 1 hour ago - the just-inserted
    // row obviously isn't, simulating "not enough time has elapsed" (a real
    // caller computes minStartedAt = now - storyMinCompletionSeconds).
    const minStartedAt = new Date(Date.now() - 60 * 60 * 1000);

    const result = await completeUngradedLessonProgressIfEligible(user.id, lesson.id, minStartedAt);

    expect(result).toBeNull();
    const row = await getLessonProgress(user.id, lesson.id);
    expect(row?.status).toBe("in_progress");
  });

  it("completes once the minimum time has genuinely elapsed", async () => {
    const user = await makeUser();
    const { lesson } = await makeLesson({ kind: "story" });
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
    const { lesson } = await makeLesson({ kind: "story" });
    await startLessonProgress(user.id, lesson.id);
    const minStartedAt = new Date();
    const firstCompletion = await completeUngradedLessonProgressIfEligible(user.id, lesson.id, minStartedAt);
    expect(firstCompletion?.status).toBe("completed");

    const secondCompletion = await completeUngradedLessonProgressIfEligible(user.id, lesson.id, minStartedAt);

    expect(secondCompletion).toBeNull(); // WHERE status='in_progress' no longer matches
  });

  it("returns null when the lesson was never served at all", async () => {
    const user = await makeUser();
    const { lesson } = await makeLesson({ kind: "story" });

    const result = await completeUngradedLessonProgressIfEligible(user.id, lesson.id, new Date());

    expect(result).toBeNull();
  });
});

describe("countInProgressLearners", () => {
  it("counts only in_progress rows, excluding completed ones", async () => {
    const { lesson } = await makeLesson();
    const learnerA = await makeUser();
    const learnerB = await makeUser();
    const learnerC = await makeUser();
    await startLessonProgress(learnerA.id, lesson.id);
    await startLessonProgress(learnerB.id, lesson.id);
    await startLessonProgress(learnerC.id, lesson.id);
    await completeLessonProgress(learnerC.id, lesson.id); // C finished - shouldn't count

    expect(await countInProgressLearners(lesson.id)).toBe(2);
  });

  it("returns 0 for a lesson no one has touched", async () => {
    const { lesson } = await makeLesson();
    expect(await countInProgressLearners(lesson.id)).toBe(0);
  });
});

describe("countInProgressLearnersByLessonIds", () => {
  it("counts in_progress learners per lesson in one grouped query, omitting lessons with none", async () => {
    const { lesson: lessonA } = await makeLesson();
    const { lesson: lessonB } = await makeLesson();
    const { lesson: lessonC } = await makeLesson(); // untouched
    const learner1 = await makeUser();
    const learner2 = await makeUser();
    await startLessonProgress(learner1.id, lessonA.id);
    await startLessonProgress(learner2.id, lessonA.id);
    await startLessonProgress(learner1.id, lessonB.id);
    await completeLessonProgress(learner1.id, lessonB.id); // completed - shouldn't count

    const result = await countInProgressLearnersByLessonIds([lessonA.id, lessonB.id, lessonC.id]);

    expect(result.get(lessonA.id)).toBe(2);
    expect(result.has(lessonB.id)).toBe(false); // 0 in_progress - absent, not zero-valued
    expect(result.has(lessonC.id)).toBe(false);
  });

  it("returns an empty map without querying for an empty id list", async () => {
    expect(await countInProgressLearnersByLessonIds([])).toEqual(new Map());
  });
});
