// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves report_snapshots' (user_id, week_start_date) unique
// constraint actually holds at the database level, the way
// src/server/report-card/service.ts's computeAndStoreWeeklySnapshot relies
// on it for idempotency. Never touches the real Supabase database (see
// @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  lessons,
  mentors,
  questionAnswers,
  questions,
  quizAttempts,
  roles,
  staffMembers,
  topics,
  users,
  worlds,
} from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getPublishedCoachNoteTemplatesByCategory,
  getReportSnapshot,
  insertDraftCoachNoteTemplate,
  insertReportSnapshot,
  listActiveUsersForReportCard,
  listAllCoachNoteTemplates,
  listAnsweredQuestionHistoryForUser,
  listReportSnapshotsForUser,
  publishCoachNoteTemplateRow,
  unpublishCoachNoteTemplateRow,
  updateDraftCoachNoteTemplate,
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

async function makeUser(label = "report-card-repo-user") {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId(label),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
    })
    .returning();
  return user!;
}

async function makeStaff() {
  const [role] = await db
    .insert(roles)
    .values({ key: uniqueClerkUserId("role"), name: "Test Role" })
    .returning();
  const [staff] = await db
    .insert(staffMembers)
    .values({ clerkUserId: uniqueClerkUserId("staff"), roleId: role!.id })
    .returning();
  return staff!;
}

const EMPTY_METRICS = { retention: 0, watchSpeed: 100, quizAccuracy: 0, consistency: 0 };

describe("insertReportSnapshot", () => {
  it("is idempotent on (userId, weekStartDate) - a duplicate write for the same week is a silent no-op", async () => {
    const user = await makeUser();
    const input = {
      userId: user.id,
      weekStartDate: "2026-09-21",
      efficiencyScore: 50,
      subMetrics: EMPTY_METRICS,
      moduleBreakdown: [],
      topicMastery: [],
      strengthNoteId: null,
      gapNoteId: null,
      opportunityNoteId: null,
      habitNoteId: null,
      opportunityTopic: null,
      habitDetail: null,
    };

    const first = await insertReportSnapshot(input);
    const second = await insertReportSnapshot({ ...input, efficiencyScore: 99 });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const stored = await getReportSnapshot(user.id, "2026-09-21");
    expect(stored?.efficiencyScore).toBe(50); // the second (different) write never landed
  });

  it("lets the same user have snapshots for different weeks", async () => {
    const user = await makeUser();
    await insertReportSnapshot({
      userId: user.id,
      weekStartDate: "2026-09-14",
      efficiencyScore: 40,
      subMetrics: EMPTY_METRICS,
      moduleBreakdown: [],
      topicMastery: [],
      strengthNoteId: null,
      gapNoteId: null,
      opportunityNoteId: null,
      habitNoteId: null,
      opportunityTopic: null,
      habitDetail: null,
    });
    await insertReportSnapshot({
      userId: user.id,
      weekStartDate: "2026-09-21",
      efficiencyScore: 60,
      subMetrics: EMPTY_METRICS,
      moduleBreakdown: [],
      topicMastery: [],
      strengthNoteId: null,
      gapNoteId: null,
      opportunityNoteId: null,
      habitNoteId: null,
      opportunityTopic: null,
      habitDetail: null,
    });

    const recent = await listReportSnapshotsForUser(user.id, 8);
    expect(recent.map((r) => r.weekStartDate)).toEqual(["2026-09-21", "2026-09-14"]); // newest first
  });
});

describe("coach note templates - draft/publish lifecycle", () => {
  it("creates a draft, edits it, and it isn't returned by getPublishedCoachNoteTemplatesByCategory", async () => {
    const created = await insertDraftCoachNoteTemplate({
      category: "strength",
      template: { en: "Draft", hi: "x", hx: "x" },
    });
    expect(created.status).toBe("draft");

    const published = await getPublishedCoachNoteTemplatesByCategory("strength");
    expect(published.find((t) => t.id === created.id)).toBeUndefined();

    const updated = await updateDraftCoachNoteTemplate({
      id: created.id,
      category: "strength",
      template: { en: "Edited draft", hi: "x", hx: "x" },
    });
    expect(updated?.template.en).toBe("Edited draft");
  });

  it("publish makes a template visible to getPublishedCoachNoteTemplatesByCategory; unpublish reverts it", async () => {
    const staff = await makeStaff();
    const created = await insertDraftCoachNoteTemplate({
      category: "gap",
      template: { en: "Gap note", hi: "x", hx: "x" },
    });

    const published = await publishCoachNoteTemplateRow(created.id, staff.id);
    expect(published?.status).toBe("published");
    expect(published?.publishedAt).not.toBeNull();
    expect(published?.publishedBy).toBe(staff.id);

    const visibleWhilePublished = await getPublishedCoachNoteTemplatesByCategory("gap");
    expect(visibleWhilePublished.map((t) => t.id)).toContain(created.id);

    const unpublished = await unpublishCoachNoteTemplateRow(created.id);
    expect(unpublished?.status).toBe("draft");
    expect(unpublished?.publishedAt).toBeNull();
    expect(unpublished?.publishedBy).toBeNull();

    const visibleAfterUnpublish = await getPublishedCoachNoteTemplatesByCategory("gap");
    expect(visibleAfterUnpublish.map((t) => t.id)).not.toContain(created.id);
  });

  it("listAllCoachNoteTemplates returns both draft and published rows", async () => {
    const before = await listAllCoachNoteTemplates();
    await insertDraftCoachNoteTemplate({ category: "habit", template: { en: "x", hi: "x", hx: "x" } });
    const after = await listAllCoachNoteTemplates();
    expect(after.length).toBe(before.length + 1);
  });
});

describe("listActiveUsersForReportCard", () => {
  it("excludes soft-deleted users", async () => {
    const active = await makeUser("active");
    const deleted = await makeUser("deleted");
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, deleted.id));

    const rows = await listActiveUsersForReportCard();

    expect(rows.map((r) => r.id)).toContain(active.id);
    expect(rows.map((r) => r.id)).not.toContain(deleted.id);
  });
});

// Proves the questions.topicId -> topics.name.en join actually resolves a
// real topic label against Postgres - this replaced a direct read of the
// old free-text questions.topic column (see repo.ts's comment), the one
// remaining dependency that was blocking dropping that column.
describe("listAnsweredQuestionHistoryForUser", () => {
  it("resolves topic from questions.topicId, and returns null for an untagged question", async () => {
    const user = await makeUser("topic-history");
    const [topic] = await db
      .insert(topics)
      .values({ name: { en: "RBI & rates", hi: "x", hx: "x" }, order: uniqueOrder() })
      .returning();
    const [mentor] = await db
      .insert(mentors)
      .values({
        key: uniqueKey("mentor"),
        order: uniqueOrder(),
        name: { en: "M", hi: "x", hx: "x" },
        bio: { en: "x", hi: "x", hx: "x" },
        persona: "test persona",
      })
      .returning();
    const [world] = await db
      .insert(worlds)
      .values({
        order: uniqueOrder(),
        title: { en: "W", hi: "x", hx: "x" },
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
        title: { en: "L", hi: "x", hx: "x" },
        blurb: { en: "x", hi: "x", hx: "x" },
        content: { questionIds: [] },
      })
      .returning();
    const [taggedQuestion] = await db
      .insert(questions)
      .values({
        format: "single_select",
        topicId: topic.id,
        prompt: { en: "Tagged?", hi: "x", hx: "x" },
        explanation: { en: "x", hi: "x", hx: "x" },
        payload: { options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }] },
        answer: { correctIndex: 0 },
      })
      .returning();
    const [untaggedQuestion] = await db
      .insert(questions)
      .values({
        format: "single_select",
        prompt: { en: "Untagged?", hi: "x", hx: "x" },
        explanation: { en: "x", hi: "x", hx: "x" },
        payload: { options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }] },
        answer: { correctIndex: 0 },
      })
      .returning();
    const [attempt] = await db
      .insert(quizAttempts)
      .values({ userId: user.id, lessonId: lesson.id, attemptNumber: 1, isFirstPass: true, status: "completed" })
      .returning();
    await db.insert(questionAnswers).values([
      {
        attemptId: attempt.id,
        questionId: taggedQuestion.id,
        stepIndex: 1,
        servedAt: new Date("2026-09-01T00:00:00.000Z"),
        timerSeconds: 20,
        servedRevision: 1,
        answeredAt: new Date("2026-09-01T00:00:05.000Z"),
        isCorrect: true,
      },
      {
        attemptId: attempt.id,
        questionId: untaggedQuestion.id,
        stepIndex: 2,
        servedAt: new Date("2026-09-02T00:00:00.000Z"),
        timerSeconds: 20,
        servedRevision: 1,
        answeredAt: new Date("2026-09-02T00:00:05.000Z"),
        isCorrect: false,
      },
    ]);

    const history = await listAnsweredQuestionHistoryForUser(user.id);

    expect(history).toHaveLength(2);
    expect(history[0]?.topic).toBe("RBI & rates"); // the tagged question, oldest first
    expect(history[1]?.topic).toBeNull(); // the untagged question
  });
});
