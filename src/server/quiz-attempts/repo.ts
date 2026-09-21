import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { questionAnswers, quizAttempts } from "@/db/schema";

export async function countAttemptsForUserLesson(userId: string, lessonId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.lessonId, lessonId)));
  return row?.n ?? 0;
}

// The attempt serveStep resumes into, if the learner already has one going
// for this lesson (e.g. the app was closed mid-lesson and reopened) -
// "most recent" rather than "the only one" defensively, though only one
// in_progress attempt per (user, lesson) should ever exist in practice
// (serveStep only creates a new one when none is in_progress).
export async function getLatestInProgressAttempt(userId: string, lessonId: string) {
  const [row] = await db
    .select()
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.userId, userId),
        eq(quizAttempts.lessonId, lessonId),
        eq(quizAttempts.status, "in_progress"),
      ),
    )
    .orderBy(desc(quizAttempts.startedAt))
    .limit(1);
  return row ?? null;
}

export async function getAttemptById(id: string) {
  const [row] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, id)).limit(1);
  return row ?? null;
}

export async function insertAttempt(input: {
  userId: string;
  lessonId: string;
  attemptNumber: number;
  isFirstPass: boolean;
}) {
  const [row] = await db.insert(quizAttempts).values(input).returning();
  return row;
}

// Only completes an attempt that's currently in_progress - returns null
// (not an error) otherwise, so a duplicate "last step answered" call (e.g.
// a network retry) can't double-log a completion.
export async function completeAttempt(attemptId: string, totalXpPreview: number) {
  const [row] = await db
    .update(quizAttempts)
    .set({ status: "completed", completedAt: new Date(), totalXpPreview })
    .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.status, "in_progress")))
    .returning();
  return row ?? null;
}

export async function getQuestionAnswer(attemptId: string, stepIndex: number) {
  const [row] = await db
    .select()
    .from(questionAnswers)
    .where(and(eq(questionAnswers.attemptId, attemptId), eq(questionAnswers.stepIndex, stepIndex)))
    .limit(1);
  return row ?? null;
}

// Used to look up the immediately-preceding step's combo count - combo is
// threaded step-to-step rather than recomputed from full history each time.
export async function getPreviousQuestionAnswer(attemptId: string, stepIndex: number) {
  return getQuestionAnswer(attemptId, stepIndex - 1);
}

export async function insertServedQuestionAnswer(input: {
  attemptId: string;
  questionId: string;
  stepIndex: number;
  servedAt: Date;
  timerSeconds: number;
  servedRevision: number;
}) {
  const [row] = await db.insert(questionAnswers).values(input).returning();
  return row;
}

// Only grades a step that hasn't been answered yet - returns null if
// `answeredAt` is already set, which is what makes a resubmit-with-the-
// same-attempt-id-and-step a true no-op at the DB level, not just an
// application-layer convention (see src/server/quiz-attempts/service.ts's
// submitAnswer, which checks `answeredAt` before ever calling this, but
// this guard is what makes a genuine race between two submits for the same
// step land exactly once).
export async function gradeQuestionAnswer(input: {
  attemptId: string;
  stepIndex: number;
  submittedAnswer: unknown;
  isCorrect: boolean;
  timedOut: boolean;
  speedBonusAwarded: boolean;
  feverActive: boolean;
  xpAwardedPreview: number;
  comboAfter: number;
  answeredAt: Date;
}) {
  const { attemptId, stepIndex, ...rest } = input;
  const [row] = await db
    .update(questionAnswers)
    .set(rest)
    .where(
      and(
        eq(questionAnswers.attemptId, attemptId),
        eq(questionAnswers.stepIndex, stepIndex),
        isNull(questionAnswers.answeredAt),
      ),
    )
    .returning();
  return row ?? null;
}

// Used to sum xpAwardedPreview into quizAttempts.totalXpPreview once the
// last step is answered.
export async function listQuestionAnswersForAttempt(attemptId: string) {
  return db
    .select()
    .from(questionAnswers)
    .where(eq(questionAnswers.attemptId, attemptId))
    .orderBy(asc(questionAnswers.stepIndex));
}
