import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { lessonProgress } from "@/db/schema";

// Idempotent "ensure a row exists, in_progress" - called from
// src/server/quiz-attempts/service.ts's serveStep on a lesson's first-ever
// attempt. A no-op (returns null) if a row already exists, regardless of
// its current status - this never downgrades a "completed" row back to
// "in_progress" on a later replay attempt.
export async function startLessonProgress(userId: string, lessonId: string) {
  const [row] = await db
    .insert(lessonProgress)
    .values({ userId, lessonId })
    .onConflictDoNothing({ target: [lessonProgress.userId, lessonProgress.lessonId] })
    .returning();
  return row ?? null;
}

// Called once a quiz_attempts attempt completes (src/server/quiz-attempts/
// service.ts's submitAnswer). The row always exists by this point (serveStep
// starts it before any answer can be submitted), so a plain UPDATE is safe -
// setting an already-completed row to completed again is a harmless no-op.
export async function completeLessonProgress(userId: string, lessonId: string) {
  const [row] = await db
    .update(lessonProgress)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
    .returning();
  return row ?? null;
}

// Used by src/server/lessons/service.ts's unpublish-warning (not a hard
// block - see docs/ARCHITECTURE.md D23): how many learners are mid-lesson
// (not yet completed) right now, so staff can see the actual blast radius
// before unpublishing.
export async function countInProgressLearners(lessonId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.lessonId, lessonId), eq(lessonProgress.status, "in_progress")));
  return row?.n ?? 0;
}

// Same as countInProgressLearners, but for every lesson in a world in one
// grouped query - used by src/server/lessons/service.ts's
// getLessonEditorData so rendering the admin lesson list doesn't issue one
// COUNT round-trip per lesson. Lessons with zero in-progress learners are
// simply absent from the returned map (not zero-valued rows) - callers
// default a missing key to 0.
export async function countInProgressLearnersByLessonIds(
  lessonIds: string[],
): Promise<Map<string, number>> {
  if (lessonIds.length === 0) return new Map();
  const rows = await db
    .select({ lessonId: lessonProgress.lessonId, n: count() })
    .from(lessonProgress)
    .where(and(inArray(lessonProgress.lessonId, lessonIds), eq(lessonProgress.status, "in_progress")))
    .groupBy(lessonProgress.lessonId);
  return new Map(rows.map((r) => [r.lessonId, r.n]));
}
