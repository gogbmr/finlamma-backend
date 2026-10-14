// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves GET /worlds/{id}/lessons's per-node state (WH-12,
// docs/ARCHITECTURE.md D76) actually agrees with what POST
// .../steps/{n}/serve permits, by calling both the real getPublicLessonsForWorld
// (src/server/lessons/service.ts) and the real serveStep
// (src/server/quiz-attempts/service.ts) against the same database. The
// handful of modules serveStep itself never calls (economy, certificates,
// badges, notifications, analytics) are stubbed out exactly as
// src/server/quiz-attempts/service.test.ts already does, purely so
// importing quiz-attempts/service.ts doesn't need those systems configured -
// none of their calls are exercised by any test here. Never touches the
// real Supabase database (see @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { lessons, mentors, questions, roles, staffMembers, users, worlds } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));
vi.mock("@/lib/analytics", () => ({ captureEvent: vi.fn() }));
const mockCreditLessonCompletion = vi.fn();
vi.mock("@/server/economy/service", () => ({
  creditLessonCompletion: (...args: unknown[]) => mockCreditLessonCompletion(...args),
}));
vi.mock("@/server/certificates/service", () => ({ issueCertificateIfEligible: vi.fn() }));
vi.mock("@/server/badges/service", () => ({ evaluateBadgesForUser: vi.fn() }));
vi.mock("@/server/notifications/service", () => ({ notifyUser: vi.fn() }));

const { serveStep } = await import("@/server/quiz-attempts/service");
const { getPublicLessonsForWorld } = await import("./service");
const { completeLessonProgress } = await import("@/server/lesson-progress/repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

const META = { ip: "1.2.3.4", userAgent: "test-agent" };

const [testRole] = await db
  .insert(roles)
  .values({ key: "super_admin", name: "Super Admin" })
  .returning();
const [testStaff] = await db
  .insert(staffMembers)
  .values({ clerkUserId: uniqueClerkUserId("world-home-state-staff"), roleId: testRole.id })
  .returning();
const staffId = testStaff.id;

// Low, test-specific order values, used together for the "locked" test's
// two-world sequence - world1/world2 only need to be adjacent to EACH OTHER
// in listPublishedWorlds() (nothing else may land between them), which two
// consecutive calls already guarantee regardless of what other tests in
// this file have inserted (tests run sequentially, so nothing else touches
// `worlds` between these two calls within one test).
let nextLowOrder = 1;
function uniqueLowOrder() {
  return nextLowOrder++;
}
// Strictly decreasing, so each call produces a NEW global minimum `order`
// across every world in this shared test database (including earlier
// tests' worlds in this same file) - used for a world that must be seen as
// unlocked (index 0, no predecessor) regardless of execution order or what
// other tests have already inserted. Evaluated once per test, synchronously
// before that test's own assertions run, so "global minimum at the moment
// this test checks" is all it needs to guarantee - a later test lowering
// the bar further doesn't retroactively affect an earlier, already-finished
// assertion.
let nextIsolatedOrder = -1;
function uniqueIsolatedOrder() {
  return nextIsolatedOrder--;
}
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
      clerkUserId: uniqueClerkUserId("world-home-state-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user;
}

async function makeWorld(overrides: Partial<Record<string, unknown>> = {}) {
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
      status: "published",
      ...overrides,
    })
    .returning();
  return world;
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

async function makeQuizLesson(
  worldId: string,
  chapter: number,
  step: number,
  kind: "quiz" | "boss_quiz" = "quiz",
) {
  const question = await makeQuestion();
  const [lesson] = await db
    .insert(lessons)
    .values({
      worldId,
      chapter,
      step,
      kind,
      title: { en: "Test Lesson", hi: "x", hx: "x" },
      blurb: { en: "x", hi: "x", hx: "x" },
      content: { questionIds: [question.id] },
      status: "published",
      publishedAt: new Date(),
      publishedBy: staffId,
    })
    .returning();
  return lesson;
}

describe("per-node state agrees with what serve actually permits (D76)", () => {
  it("'current' and 'available' both genuinely mean POST .../steps/1/serve succeeds right now", async () => {
    const world = await makeWorld({ order: uniqueIsolatedOrder() });
    const l1 = await makeQuizLesson(world.id, 1, 1);
    const l2 = await makeQuizLesson(world.id, 1, 2);
    const user = await makeUser();

    const before = await getPublicLessonsForWorld(world.id, user.id);
    expect(before.map((n) => n.state)).toEqual(["current", "available"]);

    // No cross-lesson lock exists within an unlocked world (only
    // within-lesson step ordering, D21/D76) - both states really are
    // immediately servable, not just "visually unlocked."
    await expect(serveStep(user, l1.id, 1, META)).resolves.toMatchObject({ stepIndex: 1 });
    await expect(serveStep(user, l2.id, 1, META)).resolves.toMatchObject({ stepIndex: 1 });
  });

  it("a completed lesson_progress row is reported 'done', and resumes 'current' at the next lesson", async () => {
    const world = await makeWorld({ order: uniqueIsolatedOrder() });
    const l1 = await makeQuizLesson(world.id, 1, 1);
    const l2 = await makeQuizLesson(world.id, 1, 2);
    const user = await makeUser();
    await serveStep(user, l1.id, 1, META); // starts lesson_progress (in_progress)
    await completeLessonProgress(user.id, l1.id); // directly marks done - the completion
    // pipeline itself (submitAnswer/economy) is covered by quiz-attempts'
    // own test suite; this test only cares whether getPublicLessonsForWorld
    // reports the resulting row correctly.

    const result = await getPublicLessonsForWorld(world.id, user.id);

    expect(result.map((n) => n.state)).toEqual(["done", "current"]);
  });

  it("every node is 'locked' for a world whose previous world's Boss Quiz hasn't been passed - and POST .../serve actually rejects it too (D76 enforcement)", async () => {
    const world1 = await makeWorld({ order: uniqueLowOrder() });
    await makeQuizLesson(world1.id, 8, 5, "boss_quiz"); // exists, but never attempted
    const world2 = await makeWorld({ order: uniqueLowOrder() });
    const l1 = await makeQuizLesson(world2.id, 1, 1);
    const user = await makeUser();

    const result = await getPublicLessonsForWorld(world2.id, user.id);
    expect(result.map((n) => n.state)).toEqual(["locked"]);

    // The listing and the gate must agree for the same learner - a "locked"
    // node is now a real, enforced rejection, not just informational.
    await expect(serveStep(user, l1.id, 1, META)).rejects.toMatchObject({ code: "LESSON_LOCKED" });
    expect(mockCreditLessonCompletion).not.toHaveBeenCalled();
  });

  it("a Boss Quiz lesson in a locked world is rejected the same way as any other lesson", async () => {
    const world1 = await makeWorld({ order: uniqueLowOrder() });
    await makeQuizLesson(world1.id, 8, 5, "boss_quiz");
    const world2 = await makeWorld({ order: uniqueLowOrder() });
    const bossQuiz2 = await makeQuizLesson(world2.id, 8, 5, "boss_quiz");
    const user = await makeUser();

    await expect(serveStep(user, bossQuiz2.id, 1, META)).rejects.toMatchObject({
      code: "LESSON_LOCKED",
    });
    expect(mockCreditLessonCompletion).not.toHaveBeenCalled();
  });
});
