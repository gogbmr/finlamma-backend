import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { lessons } from "@/db/schema";
import type { CreateLessonDraftInput, HotfixLessonInput, UpdateLessonDraftInput } from "./schemas";

// D24 (docs/ARCHITECTURE.md): used by worlds/service.ts's publishWorld -
// a world can't publish unless it already has a boss_quiz-kind lesson
// (ANY status, draft is enough). The lesson itself can't be published
// until AFTER its world is, so requiring a PUBLISHED one at world-publish
// time would be impossible - this is the closest enforceable version of
// "don't publish a world with no boss quiz plan."
export async function hasBossQuizLesson(worldId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.worldId, worldId), eq(lessons.kind, "boss_quiz")))
    .limit(1);
  return !!row;
}

export async function listPublishedLessonsForWorld(worldId: string) {
  return db
    .select()
    .from(lessons)
    .where(and(eq(lessons.worldId, worldId), eq(lessons.status, "published")))
    .orderBy(asc(lessons.chapter), asc(lessons.step));
}

export async function getPublishedLesson(id: string) {
  const [row] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, id), eq(lessons.status, "published")))
    .limit(1);
  return row ?? null;
}

export async function getPublishedLessonAtPosition(worldId: string, chapter: number, step: number) {
  const [row] = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.worldId, worldId),
        eq(lessons.chapter, chapter),
        eq(lessons.step, step),
        eq(lessons.status, "published"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// Admin editor: every lesson in a world regardless of status, ordered for
// display.
export async function listAllLessonsForWorld(worldId: string) {
  return db
    .select()
    .from(lessons)
    .where(eq(lessons.worldId, worldId))
    .orderBy(asc(lessons.chapter), asc(lessons.step));
}

export async function getLessonById(id: string) {
  const [row] = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
  return row ?? null;
}

// Used by worlds/service.ts's unpublishWorld to block unpublishing a world
// that a published lesson still belongs to - same pattern as
// mentors/service.ts's unpublishMentor checking listPublishedWorldsByMentorId.
export async function listPublishedLessonsByWorldId(worldId: string) {
  return db
    .select()
    .from(lessons)
    .where(and(eq(lessons.worldId, worldId), eq(lessons.status, "published")));
}

// Every published lesson, across every world - used by
// listPublishedLessonsReferencingQuestion (this file) to scan for a
// question id inside lesson content, which is jsonb, not a relational
// column, so there's no WHERE clause that can do this filtering in SQL.
// Worlds/lessons are staff-created with no fixed count (D25,
// docs/ARCHITECTURE.md), but the total stays small enough in practice for
// this full-table scan to remain cheap.
export async function listAllPublishedLessons() {
  return db.select().from(lessons).where(eq(lessons.status, "published"));
}

export async function insertDraftLesson(input: CreateLessonDraftInput) {
  const [row] = await db.insert(lessons).values(input).returning();
  return row;
}

// Only updates a lesson that's currently a draft - returns null (not an
// error) if the row doesn't exist or is published, so the service layer can
// turn that into a clear "unpublish it first" message rather than a silent
// no-op update. `kind` is deliberately not part of `input` - it's immutable
// after creation (see UpdateLessonDraftSchema).
export async function updateDraftLesson(input: UpdateLessonDraftInput) {
  const { id, ...rest } = input;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(lessons)
      .set(rest)
      .where(and(eq(lessons.id, id), eq(lessons.status, "draft")))
      .returning();
    return row ?? null;
  });
}

export async function publishLessonRow(id: string, staffId: string) {
  const [row] = await db
    .update(lessons)
    .set({ status: "published", publishedAt: new Date(), publishedBy: staffId })
    .where(and(eq(lessons.id, id), eq(lessons.status, "draft")))
    .returning();
  return row ?? null;
}

// D23 (docs/ARCHITECTURE.md): only updates a lesson that's currently
// PUBLISHED - returns null if the row doesn't exist or is a draft,
// mirroring updateDraftLesson's opposite-status guard. `worldId`/`chapter`/
// `step`/`kind` are deliberately not part of `input` - those stay
// structural/draft-only, same reasoning as every other domain's hotfix (D20).
export async function hotfixLessonRow(input: HotfixLessonInput) {
  const { id, ...rest } = input;
  const [row] = await db
    .update(lessons)
    .set(rest)
    .where(and(eq(lessons.id, id), eq(lessons.status, "published")))
    .returning();
  return row ?? null;
}

export async function unpublishLessonRow(id: string) {
  const [row] = await db
    .update(lessons)
    .set({ status: "draft", publishedAt: null, publishedBy: null })
    .where(and(eq(lessons.id, id), eq(lessons.status, "published")))
    .returning();
  return row ?? null;
}
