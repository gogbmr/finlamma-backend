// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real unique constraint on (world_id, chapter,
// step), the world FK, and the draft-only update/publish guards actually
// hold at the database level. Never touches the real Supabase database (see
// @/db/client's NODE_ENV=test guard). src/server/lessons/service.test.ts
// covers the service layer with this repo mocked out.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { mentors, roles, staffMembers, worlds } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getLessonById,
  getPublishedLesson,
  getPublishedLessonAtPosition,
  insertDraftLesson,
  listPublishedLessonsByWorldId,
  listPublishedLessonsForWorld,
  publishLessonRow,
  unpublishLessonRow,
  updateDraftLesson,
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
  .values({ clerkUserId: uniqueClerkUserId("lessons-repo-test-staff"), roleId: testRole.id })
  .returning();
const staffId = testStaff.id;

let nextOrder = 100_000;
function uniqueOrder() {
  return nextOrder++;
}
function uniqueKey(label: string) {
  return `${label}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

async function makeWorld() {
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
  return world;
}

const TITLE = { en: "Test Lesson", hi: "x", hx: "x" };
const BLURB = { en: "x", hi: "x", hx: "x" };
const QUIZ_CONTENT = { questionIds: [] };

async function draftInput(overrides: Partial<Record<string, unknown>> = {}) {
  const worldId = (overrides.worldId as string | undefined) ?? (await makeWorld()).id;
  return {
    worldId,
    chapter: 1,
    step: 1,
    kind: "quiz" as const,
    title: TITLE,
    blurb: BLURB,
    content: QUIZ_CONTENT,
    ...overrides,
  };
}

describe("insertDraftLesson", () => {
  it("creates a draft lesson", async () => {
    const created = await insertDraftLesson(await draftInput());
    expect(created.status).toBe("draft");
  });

  it("rejects a duplicate (world_id, chapter, step)", async () => {
    const worldId = (await makeWorld()).id;
    await insertDraftLesson(await draftInput({ worldId, chapter: 2, step: 3 }));
    await expect(
      insertDraftLesson(await draftInput({ worldId, chapter: 2, step: 3 })),
    ).rejects.toThrow();
  });

  it("allows the same (chapter, step) in a different world", async () => {
    const worldA = (await makeWorld()).id;
    const worldB = (await makeWorld()).id;
    await insertDraftLesson(await draftInput({ worldId: worldA, chapter: 1, step: 1 }));
    const secondWorldLesson = await insertDraftLesson(
      await draftInput({ worldId: worldB, chapter: 1, step: 1 }),
    );
    expect(secondWorldLesson.status).toBe("draft");
  });

  it("rejects a nonexistent worldId (FK violation)", async () => {
    await expect(
      insertDraftLesson(await draftInput({ worldId: randomUUID() })),
    ).rejects.toThrow();
  });
});

describe("updateDraftLesson", () => {
  it("updates a draft lesson's fields", async () => {
    const created = await insertDraftLesson(await draftInput());
    const updated = await updateDraftLesson({
      id: created.id,
      worldId: created.worldId,
      chapter: created.chapter,
      step: created.step,
      title: { en: "Updated", hi: "x", hx: "x" },
      blurb: created.blurb,
      content: created.content,
    });
    expect(updated?.title.en).toBe("Updated");
  });

  it("returns null (does not update) when the lesson is currently published", async () => {
    const created = await insertDraftLesson(await draftInput());
    await publishLessonRow(created.id, staffId);

    const result = await updateDraftLesson({
      id: created.id,
      worldId: created.worldId,
      chapter: created.chapter,
      step: created.step,
      title: { en: "Should not apply", hi: "x", hx: "x" },
      blurb: created.blurb,
      content: created.content,
    });

    expect(result).toBeNull();
    const row = await getLessonById(created.id);
    expect(row?.title.en).not.toBe("Should not apply");
  });

  it("returns null for a nonexistent lesson", async () => {
    const worldId = (await makeWorld()).id;
    const result = await updateDraftLesson({
      id: randomUUID(),
      worldId,
      chapter: 1,
      step: 1,
      title: TITLE,
      blurb: BLURB,
      content: QUIZ_CONTENT,
    });
    expect(result).toBeNull();
  });
});

describe("publishLessonRow / unpublishLessonRow", () => {
  it("publishes a draft lesson, stamping publishedAt/publishedBy", async () => {
    const created = await insertDraftLesson(await draftInput());

    const published = await publishLessonRow(created.id, staffId);

    expect(published?.status).toBe("published");
    expect(published?.publishedBy).toBe(staffId);
    expect(published?.publishedAt).toBeInstanceOf(Date);
  });

  it("returns null when the lesson is already published (not a draft)", async () => {
    const created = await insertDraftLesson(await draftInput());
    await publishLessonRow(created.id, staffId);

    const result = await publishLessonRow(created.id, staffId);

    expect(result).toBeNull();
  });

  it("unpublishes a published lesson back to draft, clearing publishedAt/publishedBy", async () => {
    const created = await insertDraftLesson(await draftInput());
    await publishLessonRow(created.id, staffId);

    const unpublished = await unpublishLessonRow(created.id);

    expect(unpublished?.status).toBe("draft");
    expect(unpublished?.publishedAt).toBeNull();
    expect(unpublished?.publishedBy).toBeNull();
  });
});

describe("getPublishedLessonAtPosition", () => {
  it("finds a published lesson at the given world/chapter/step", async () => {
    const worldId = (await makeWorld()).id;
    const created = await insertDraftLesson(await draftInput({ worldId, chapter: 1, step: 1 }));
    await publishLessonRow(created.id, staffId);

    const result = await getPublishedLessonAtPosition(worldId, 1, 1);

    expect(result?.id).toBe(created.id);
  });

  it("returns null when the lesson at that position is only a draft", async () => {
    const worldId = (await makeWorld()).id;
    await insertDraftLesson(await draftInput({ worldId, chapter: 1, step: 1 }));

    const result = await getPublishedLessonAtPosition(worldId, 1, 1);

    expect(result).toBeNull();
  });
});

describe("listPublishedLessonsByWorldId", () => {
  it("returns only published lessons in the given world", async () => {
    const worldId = (await makeWorld()).id;
    const published = await insertDraftLesson(await draftInput({ worldId, chapter: 1, step: 1 }));
    await publishLessonRow(published.id, staffId);
    const draft = await insertDraftLesson(await draftInput({ worldId, chapter: 1, step: 2 }));
    const otherWorldLesson = await insertDraftLesson(await draftInput());
    await publishLessonRow(otherWorldLesson.id, staffId);

    const result = await listPublishedLessonsByWorldId(worldId);

    expect(result.map((l) => l.id)).toEqual([published.id]);
    expect(result.map((l) => l.id)).not.toContain(draft.id);
    expect(result.map((l) => l.id)).not.toContain(otherWorldLesson.id);
  });
});

// Consolidated proof (Phase 2b Checkpoint 4b kickoff: "Drafts are never
// reachable through any public/app endpoint. Test that.") that every
// repo function the app-facing service layer actually calls
// (getPublicLesson -> getPublishedLesson, getPublicLessonsForWorld ->
// listPublishedLessonsForWorld, getCurrentLesson ->
// getPublishedLessonAtPosition, already covered above) excludes a draft at
// the database level, not just by service-layer convention. Staff-only
// access to a draft (getLessonPreview -> getLessonById, unfiltered by
// design) is covered separately in service.test.ts, contrasted directly
// against getPublicLesson on the same draft id.
describe("drafts are never reachable through any of the published-only repo functions", () => {
  it("getPublishedLesson returns null for a lesson that's only a draft", async () => {
    const created = await insertDraftLesson(await draftInput());

    expect(await getPublishedLesson(created.id)).toBeNull();
    // Sanity check: the id is real, just not published - getLessonById
    // (the staff-only, unfiltered read) still finds it.
    expect(await getLessonById(created.id)).not.toBeNull();
  });

  it("listPublishedLessonsForWorld excludes a draft lesson in the same world", async () => {
    const worldId = (await makeWorld()).id;
    const draft = await insertDraftLesson(await draftInput({ worldId, chapter: 1, step: 1 }));
    const published = await insertDraftLesson(await draftInput({ worldId, chapter: 1, step: 2 }));
    await publishLessonRow(published.id, staffId);

    const result = await listPublishedLessonsForWorld(worldId);

    expect(result.map((l) => l.id)).toEqual([published.id]);
    expect(result.map((l) => l.id)).not.toContain(draft.id);
  });
});
