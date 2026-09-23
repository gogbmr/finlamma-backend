import { and, count, eq, inArray, lte } from "drizzle-orm";
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

// Story/Doubt Zone (Phase 3 Checkpoint 3): the row created by
// startLessonProgress carries the server-stamped `startedAt` these kinds
// need as their anti-instant-complete anchor (they have no quiz_attempts
// row at all, D23). Read back after an insert attempt so a re-serve
// returns the ORIGINAL startedAt, never a new one - same idempotent-serve
// shape as quiz-attempts/service.ts's serveStep.
export async function getLessonProgress(userId: string, lessonId: string) {
  const [row] = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
    .limit(1);
  return row ?? null;
}

// Story/Doubt Zone completion (Phase 3 Checkpoint 3, docs/ECONOMY.md
// decision 4): the UPDATE's own WHERE clause is the atomicity guarantee -
// `status = 'in_progress'` means an already-completed row (or a
// concurrent duplicate completion request) simply doesn't match and
// `.returning()` comes back empty, and `started_at <= minStartedAt` means
// a request that arrives before enough time has elapsed doesn't match
// either. The caller (src/server/lesson-progress/service.ts) tells these
// two "why did nothing update" cases apart by re-reading the row - this
// function only needs to guarantee it never marks a lesson complete before
// its own minimum time has genuinely elapsed, even under a race.
export async function completeUngradedLessonProgressIfEligible(
  userId: string,
  lessonId: string,
  minStartedAt: Date,
) {
  const [row] = await db
    .update(lessonProgress)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.lessonId, lessonId),
        eq(lessonProgress.status, "in_progress"),
        lte(lessonProgress.startedAt, minStartedAt),
      ),
    )
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
