import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { lessons } from "@/db/schema";
import type { CreateLessonDraftInput, UpdateLessonDraftInput } from "./schemas";

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

export async function unpublishLessonRow(id: string) {
  const [row] = await db
    .update(lessons)
    .set({ status: "draft", publishedAt: null, publishedBy: null })
    .where(and(eq(lessons.id, id), eq(lessons.status, "published")))
    .returning();
  return row ?? null;
}
