// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - never touches the real Supabase database (see @/db/client's
// NODE_ENV=test guard). Proves the edition-date uniqueness, the eligible-
// question join (published question + published story only), the answer
// step uniqueness, and the credited-today sum query actually hold at the
// database level.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { newsRaw, newsStories, pulseCheckAttempts, questions, users, vmoneyLedger } from "@/db/schema";
import { istDateStartUtc } from "@/lib/ist-date";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getActiveUserCount,
  getAnswerByStep,
  getDailyCompletedAttemptCounts,
  getEditionByDate,
  gradeAnswerRowIfUnanswered,
  insertAttempt,
  insertEditionIfNew,
  insertServedAnswerIfNew,
  listEligibleQuestionsForEdition,
  markAttemptCompleted,
  sumPulseCheckVmCreditedToday,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function seedUser() {
  const [user] = await db
    .insert(users)
    .values({ clerkUserId: uniqueClerkUserId("pulse-check-repo-test"), clerkUpdatedAt: new Date() })
    .returning();
  return user;
}

async function seedPublishedQuestionFromPublishedStory(externalId: string, format: "single_select" = "single_select") {
  const [raw] = await db
    .insert(newsRaw)
    .values({
      source: "mock",
      externalId,
      url: `https://example.com/${externalId}`,
      headline: "H",
      summary: "S",
      publishedAt: new Date(),
      payload: {},
    })
    .returning();
  const [story] = await db
    .insert(newsStories)
    .values({
      rawId: raw.id,
      category: "inflation",
      impact: "neutral",
      content: { headline: { en: "H", hi: "H", hx: "H" }, summary: { en: "S", hi: "S", hx: "S" }, body: [{ en: "B", hi: "x", hx: "x" }] },
      jargon: { term: { en: "x", hi: "x", hx: "x" }, explanation: { en: "x", hi: "x", hx: "x" } },
      outlet: "mock",
      sourceUrl: raw.url,
      qualityGrade: "A",
      status: "published",
    })
    .returning();
  const [question] = await db
    .insert(questions)
    .values({
      format,
      sourceStoryId: story.id,
      prompt: { en: "P", hi: "P", hx: "P" },
      explanation: { en: "E", hi: "E", hx: "E" },
      payload: { options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }, { en: "C", hi: "x", hx: "x" }] },
      answer: { correctIndex: 0 },
      status: "published",
    })
    .returning();
  return { raw, story, question };
}

describe("insertEditionIfNew / getEditionByDate", () => {
  it("creates an edition for a date that doesn't have one yet", async () => {
    const created = await insertEditionIfNew("2026-01-01", ["q1", "q2"]);
    expect(created?.date).toBe("2026-01-01");
    expect(created?.questionIds).toEqual(["q1", "q2"]);
  });

  it("is idempotent on date - a second insert for the same date is a no-op", async () => {
    await insertEditionIfNew("2026-01-02", ["q1"]);
    const second = await insertEditionIfNew("2026-01-02", ["q2", "q3"]);
    expect(second).toBeNull();

    const existing = await getEditionByDate("2026-01-02");
    expect(existing?.questionIds).toEqual(["q1"]); // the FIRST insert wins, never overwritten
  });
});

describe("listEligibleQuestionsForEdition", () => {
  it("only includes published questions whose source story is also published", async () => {
    const eligible = await seedPublishedQuestionFromPublishedStory("eligible-a");

    // A draft question from a published story
    const rawB = await db
      .insert(newsRaw)
      .values({ source: "mock", externalId: "draft-q", url: "https://x", headline: "H", summary: "S", publishedAt: new Date(), payload: {} })
      .returning();
    const storyB = await db
      .insert(newsStories)
      .values({
        rawId: rawB[0].id,
        category: "banking",
        impact: "neutral",
        content: { headline: { en: "H", hi: "H", hx: "H" }, summary: { en: "S", hi: "S", hx: "S" }, body: [{ en: "B", hi: "x", hx: "x" }] },
        jargon: { term: { en: "x", hi: "x", hx: "x" }, explanation: { en: "x", hi: "x", hx: "x" } },
        outlet: "mock",
        sourceUrl: "https://x",
        qualityGrade: "B",
        status: "published",
      })
      .returning();
    const [draftQuestion] = await db
      .insert(questions)
      .values({
        format: "single_select",
        sourceStoryId: storyB[0].id,
        prompt: { en: "P", hi: "P", hx: "P" },
        explanation: { en: "E", hi: "E", hx: "E" },
        payload: { options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }] },
        answer: { correctIndex: 0 },
        status: "draft", // NOT published - must be excluded
      })
      .returning();

    const results = await listEligibleQuestionsForEdition(["single_select"], 50);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(eligible.question.id);
    expect(ids).not.toContain(draftQuestion.id);
  });

  it("filters by the enabled formats list - a disabled format never appears", async () => {
    const { question } = await seedPublishedQuestionFromPublishedStory("format-filter-a", "single_select");

    const onlyOrdering = await listEligibleQuestionsForEdition(["ordering"], 50);
    expect(onlyOrdering.map((r) => r.id)).not.toContain(question.id);

    const includingSingleSelect = await listEligibleQuestionsForEdition(["single_select", "ordering"], 50);
    expect(includingSingleSelect.map((r) => r.id)).toContain(question.id);
  });
});

describe("insertServedAnswerIfNew / gradeAnswerRowIfUnanswered", () => {
  it("a duplicate serve for the same step returns the original servedAt, not a new one", async () => {
    const user = await seedUser();
    const { question } = await seedPublishedQuestionFromPublishedStory("serve-a");
    const edition = await insertEditionIfNew("2026-02-01", [question.id]);
    const attempt = await insertAttempt(user.id, edition!.id);

    const first = await insertServedAnswerIfNew({
      attemptId: attempt.id,
      questionId: question.id,
      stepIndex: 1,
      timerSeconds: 20,
      servedRevision: 0,
    });
    const second = await insertServedAnswerIfNew({
      attemptId: attempt.id,
      questionId: question.id,
      stepIndex: 1,
      timerSeconds: 20,
      servedRevision: 0,
    });

    expect(second?.servedAt.getTime()).toBe(first?.servedAt.getTime());
  });

  it("grading twice never re-scores - the second call matches nothing and the original result stands", async () => {
    const user = await seedUser();
    const { question } = await seedPublishedQuestionFromPublishedStory("grade-a");
    const edition = await insertEditionIfNew("2026-02-02", [question.id]);
    const attempt = await insertAttempt(user.id, edition!.id);
    await insertServedAnswerIfNew({ attemptId: attempt.id, questionId: question.id, stepIndex: 1, timerSeconds: 20, servedRevision: 0 });

    const firstGrade = await gradeAnswerRowIfUnanswered(attempt.id, 1, {
      submittedAnswer: { correctIndex: 0 },
      isCorrect: true,
      timedOut: false,
      speedBonusAwarded: true,
      comboAfter: 1,
      vmAwardedPaise: 5000,
    });
    const secondGrade = await gradeAnswerRowIfUnanswered(attempt.id, 1, {
      submittedAnswer: { correctIndex: 1 }, // a different (wrong) answer this time
      isCorrect: false,
      timedOut: false,
      speedBonusAwarded: false,
      comboAfter: 0,
      vmAwardedPaise: 0,
    });

    expect(firstGrade?.vmAwardedPaise).toBe(5000);
    expect(secondGrade).toBeNull(); // matched nothing - already answered

    const stored = await getAnswerByStep(attempt.id, 1);
    expect(stored?.vmAwardedPaise).toBe(5000); // unchanged by the second attempt
  });
});

describe("markAttemptCompleted", () => {
  it("only updates an in_progress attempt, and only once", async () => {
    const user = await seedUser();
    const { question } = await seedPublishedQuestionFromPublishedStory("complete-a");
    const edition = await insertEditionIfNew("2026-02-03", [question.id]);
    const attempt = await insertAttempt(user.id, edition!.id);

    const result = {
      accuracyPct: 100,
      bestCombo: 1,
      allCorrectBonusAwarded: true,
      rawVmEarnedPaise: 5000,
      totalVmAwardedPaise: 5000,
      dailyCapReached: false,
    };
    const first = await markAttemptCompleted(attempt.id, result);
    const second = await markAttemptCompleted(attempt.id, { ...result, totalVmAwardedPaise: 9999 });

    expect(first?.status).toBe("completed");
    expect(second).toBeNull(); // already completed, WHERE status = 'in_progress' matches nothing
  });
});

describe("sumPulseCheckVmCreditedToday", () => {
  it("sums only pulse_check_attempt-sourced credits from today, scoped to the user", async () => {
    const user = await seedUser();
    const otherUser = await seedUser();
    const now = new Date();

    await db.insert(vmoneyLedger).values([
      { userId: user.id, amountPaise: 3000, sourceType: "pulse_check_attempt", sourceId: randomUUID(), reason: "x" },
      { userId: user.id, amountPaise: 2000, sourceType: "pulse_check_attempt", sourceId: randomUUID(), reason: "x" },
      { userId: user.id, amountPaise: 9000, sourceType: "lesson_completion", sourceId: randomUUID(), reason: "x" }, // different source, excluded
      { userId: otherUser.id, amountPaise: 5000, sourceType: "pulse_check_attempt", sourceId: randomUUID(), reason: "x" }, // different user, excluded
    ]);

    const total = await sumPulseCheckVmCreditedToday(user.id, now);
    expect(total).toBe(5000);
  });

  it("returns 0 when nothing has been credited", async () => {
    const user = await seedUser();
    expect(await sumPulseCheckVmCreditedToday(user.id, new Date())).toBe(0);
  });
});

describe("getDailyCompletedAttemptCounts / getActiveUserCount", () => {
  it("buckets completed attempts by IST calendar day and counts distinct users", async () => {
    const userA = await seedUser();
    const userB = await seedUser();
    const { question } = await seedPublishedQuestionFromPublishedStory("engagement-a");
    const edition = await insertEditionIfNew("2026-03-01", [question.id]);

    // 2026-03-01T20:00:00 IST = 2026-03-01T14:30:00Z - well inside the same IST day
    const completedAtIst = new Date("2026-03-01T14:30:00.000Z");
    await db.insert(pulseCheckAttempts).values([
      { userId: userA.id, editionId: edition!.id, status: "completed", completedAt: completedAtIst },
      { userId: userB.id, editionId: edition!.id, status: "completed", completedAt: completedAtIst },
      // Same user completing a second attempt the same day must not double-count.
      { userId: userA.id, editionId: edition!.id, status: "completed", completedAt: completedAtIst },
      // An in_progress attempt must never be counted.
      { userId: userA.id, editionId: edition!.id, status: "in_progress" },
    ]);

    const counts = await getDailyCompletedAttemptCounts(istDateStartUtc(completedAtIst));
    const day = counts.find((c) => c.date === "2026-03-01");
    expect(day?.distinctUsers).toBe(2);
  });

  it("getActiveUserCount excludes deleted users", async () => {
    const before = await getActiveUserCount();
    await seedUser();
    const [deleted] = await db
      .insert(users)
      .values({ clerkUserId: `deleted_${randomUUID()}`, clerkUpdatedAt: new Date(), deletedAt: new Date() })
      .returning();

    const after = await getActiveUserCount();
    expect(after).toBe(before + 1); // only the active user counted, not the deleted one
    expect(deleted.deletedAt).not.toBeNull();
  });
});
