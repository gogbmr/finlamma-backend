// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the FKs, the one-row-per-(attempt,step) unique
// constraint, and the in_progress/unanswered guards actually hold at the
// database level. Never touches the real Supabase database (see
// @/db/client's NODE_ENV=test guard). src/server/quiz-attempts/service.test.ts
// covers the service layer (and every anti-cheat rule) with this repo mocked out.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { lessons, mentors, questions, roles, staffMembers, users, worlds } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  completeAttempt,
  countAttemptsForUserLesson,
  getAttemptById,
  getLatestInProgressAttempt,
  getPreviousQuestionAnswer,
  getQuestionAnswer,
  gradeQuestionAnswer,
  insertAttempt,
  insertServedQuestionAnswer,
  listQuestionAnswersForAttempt,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

const [testRole] = await db
  .insert(roles)
  .values({ key: "super_admin", name: "Super Admin" })
  .returning();
const [testStaff] = await db
  .insert(staffMembers)
  .values({ clerkUserId: uniqueClerkUserId("quiz-attempts-repo-staff"), roleId: testRole.id })
  .returning();
const staffId = testStaff.id;

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
      clerkUserId: uniqueClerkUserId("quiz-attempts-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

async function makeQuestion() {
  const [question] = await db
    .insert(questions)
    .values({
      format: "single_select",
      prompt: { en: "What is a stock?", hi: "x", hx: "x" },
      explanation: { en: "A share.", hi: "x", hx: "x" },
      payload: { options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }] },
      answer: { correctIndex: 0 },
      status: "published",
      publishedAt: new Date(),
      publishedBy: staffId,
    })
    .returning();
  return question;
}

async function makeLesson() {
  const [mentor] = await db
    .insert(mentors)
    .values({
      key: uniqueKey("mentor"),
      order: uniqueOrder(),
      name: { en: "Test Mentor", hi: "x", hx: "x" },
      bio: { en: "x", hi: "x", hx: "x" },
      worldRangeStart: 1,
      worldRangeEnd: 3,
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
    })
    .returning();
  return lesson;
}

describe("countAttemptsForUserLesson / insertAttempt / getLatestInProgressAttempt", () => {
  it("counts 0 before any attempt exists, then 1 after one is inserted", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();

    expect(await countAttemptsForUserLesson(user.id, lesson.id)).toBe(0);

    await insertAttempt({ userId: user.id, lessonId: lesson.id, attemptNumber: 1, isFirstPass: true });

    expect(await countAttemptsForUserLesson(user.id, lesson.id)).toBe(1);
  });

  it("getLatestInProgressAttempt finds an in_progress attempt and ignores a completed one", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    const completed = await insertAttempt({
      userId: user.id,
      lessonId: lesson.id,
      attemptNumber: 1,
      isFirstPass: true,
    });
    await completeAttempt(completed.id, 100);

    expect(await getLatestInProgressAttempt(user.id, lesson.id)).toBeNull();

    const inProgress = await insertAttempt({
      userId: user.id,
      lessonId: lesson.id,
      attemptNumber: 2,
      isFirstPass: false,
    });

    const found = await getLatestInProgressAttempt(user.id, lesson.id);
    expect(found?.id).toBe(inProgress.id);
  });

  it("rejects a nonexistent lessonId (FK violation)", async () => {
    const user = await makeUser();
    await expect(
      insertAttempt({ userId: user.id, lessonId: randomUUID(), attemptNumber: 1, isFirstPass: true }),
    ).rejects.toThrow();
  });
});

describe("completeAttempt", () => {
  it("completes an in_progress attempt, stamping completedAt/totalXpPreview", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    const attempt = await insertAttempt({
      userId: user.id,
      lessonId: lesson.id,
      attemptNumber: 1,
      isFirstPass: true,
    });

    const completed = await completeAttempt(attempt.id, 42);

    expect(completed?.status).toBe("completed");
    expect(completed?.totalXpPreview).toBe(42);
    expect(completed?.completedAt).toBeInstanceOf(Date);
  });

  it("returns null when the attempt is already completed (idempotent guard at the DB level)", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    const attempt = await insertAttempt({
      userId: user.id,
      lessonId: lesson.id,
      attemptNumber: 1,
      isFirstPass: true,
    });
    await completeAttempt(attempt.id, 42);

    const second = await completeAttempt(attempt.id, 999);

    expect(second).toBeNull();
    const row = await getAttemptById(attempt.id);
    expect(row?.totalXpPreview).toBe(42); // untouched by the second call
  });
});

describe("insertServedQuestionAnswer / getQuestionAnswer / getPreviousQuestionAnswer", () => {
  it("serves a step and finds it back by (attemptId, stepIndex)", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    const question = await makeQuestion();
    const attempt = await insertAttempt({
      userId: user.id,
      lessonId: lesson.id,
      attemptNumber: 1,
      isFirstPass: true,
    });

    const served = await insertServedQuestionAnswer({
      attemptId: attempt.id,
      questionId: question.id,
      stepIndex: 1,
      servedAt: new Date(),
      timerSeconds: 10,
      servedRevision: 1,
    });

    const found = await getQuestionAnswer(attempt.id, 1);
    expect(found?.id).toBe(served.id);
    expect(found?.answeredAt).toBeNull();
  });

  it("rejects a duplicate (attemptId, stepIndex) - the unique index backing one-answer-per-step", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    const question = await makeQuestion();
    const attempt = await insertAttempt({
      userId: user.id,
      lessonId: lesson.id,
      attemptNumber: 1,
      isFirstPass: true,
    });
    await insertServedQuestionAnswer({
      attemptId: attempt.id,
      questionId: question.id,
      stepIndex: 1,
      servedAt: new Date(),
      timerSeconds: 10,
      servedRevision: 1,
    });

    await expect(
      insertServedQuestionAnswer({
        attemptId: attempt.id,
        questionId: question.id,
        stepIndex: 1,
        servedAt: new Date(),
        timerSeconds: 10,
        servedRevision: 1,
      }),
    ).rejects.toThrow();
  });

  it("getPreviousQuestionAnswer finds stepIndex-1, and returns null if it wasn't served", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    const question = await makeQuestion();
    const attempt = await insertAttempt({
      userId: user.id,
      lessonId: lesson.id,
      attemptNumber: 1,
      isFirstPass: true,
    });
    const step1 = await insertServedQuestionAnswer({
      attemptId: attempt.id,
      questionId: question.id,
      stepIndex: 1,
      servedAt: new Date(),
      timerSeconds: 10,
      servedRevision: 1,
    });

    const found = await getPreviousQuestionAnswer(attempt.id, 2);
    expect(found?.id).toBe(step1.id);
    expect(await getPreviousQuestionAnswer(attempt.id, 1)).toBeNull(); // there's no step 0
  });
});

describe("gradeQuestionAnswer", () => {
  async function serveOneStep() {
    const user = await makeUser();
    const lesson = await makeLesson();
    const question = await makeQuestion();
    const attempt = await insertAttempt({
      userId: user.id,
      lessonId: lesson.id,
      attemptNumber: 1,
      isFirstPass: true,
    });
    await insertServedQuestionAnswer({
      attemptId: attempt.id,
      questionId: question.id,
      stepIndex: 1,
      servedAt: new Date(),
      timerSeconds: 10,
      servedRevision: 1,
    });
    return { attempt, question };
  }

  it("grades an unanswered step, stamping every graded field", async () => {
    const { attempt } = await serveOneStep();

    const graded = await gradeQuestionAnswer({
      attemptId: attempt.id,
      stepIndex: 1,
      submittedAnswer: { correctIndex: 0 },
      isCorrect: true,
      timedOut: false,
      speedBonusAwarded: true,
      feverActive: false,
      xpAwardedPreview: 30,
      comboAfter: 1,
      answeredAt: new Date(),
    });

    expect(graded?.isCorrect).toBe(true);
    expect(graded?.xpAwardedPreview).toBe(30);
    expect(graded?.answeredAt).toBeInstanceOf(Date);
  });

  it("returns null (does not re-grade) when the step is already answered - the DB-level idempotency guard", async () => {
    const { attempt } = await serveOneStep();
    await gradeQuestionAnswer({
      attemptId: attempt.id,
      stepIndex: 1,
      submittedAnswer: { correctIndex: 0 },
      isCorrect: true,
      timedOut: false,
      speedBonusAwarded: true,
      feverActive: false,
      xpAwardedPreview: 30,
      comboAfter: 1,
      answeredAt: new Date(),
    });

    const second = await gradeQuestionAnswer({
      attemptId: attempt.id,
      stepIndex: 1,
      submittedAnswer: { correctIndex: 1 }, // a different, later resubmit attempt
      isCorrect: false,
      timedOut: false,
      speedBonusAwarded: false,
      feverActive: false,
      xpAwardedPreview: 999,
      comboAfter: 0,
      answeredAt: new Date(),
    });

    expect(second).toBeNull();
    const row = await getQuestionAnswer(attempt.id, 1);
    expect(row?.xpAwardedPreview).toBe(30); // untouched - the first grade wins, no double scoring
  });
});

describe("listQuestionAnswersForAttempt", () => {
  it("returns every step for the attempt, ordered by stepIndex", async () => {
    const user = await makeUser();
    const lesson = await makeLesson();
    const q1 = await makeQuestion();
    const q2 = await makeQuestion();
    const attempt = await insertAttempt({
      userId: user.id,
      lessonId: lesson.id,
      attemptNumber: 1,
      isFirstPass: true,
    });
    await insertServedQuestionAnswer({
      attemptId: attempt.id,
      questionId: q2.id,
      stepIndex: 2,
      servedAt: new Date(),
      timerSeconds: 10,
      servedRevision: 1,
    });
    await insertServedQuestionAnswer({
      attemptId: attempt.id,
      questionId: q1.id,
      stepIndex: 1,
      servedAt: new Date(),
      timerSeconds: 10,
      servedRevision: 1,
    });

    const result = await listQuestionAnswersForAttempt(attempt.id);

    expect(result.map((r) => r.stepIndex)).toEqual([1, 2]);
  });
});
