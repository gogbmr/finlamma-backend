import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  newsEditions,
  newsStories,
  pulseCheckAnswers,
  pulseCheckAttempts,
  questionRevisions,
  questions,
  users,
  vmoneyLedger,
} from "@/db/schema";
import { istDateStartUtc } from "@/lib/ist-date";

// Published questions AI-drafted from a published story, for building an
// edition's question pool - an inner join so a question whose source story
// was later hidden (or is still draft) is automatically excluded, with no
// separate "is the story still live" check needed. `format`-filtered to the
// admin's enabledFormats set (NW-41). Ordered randomly at the database
// level (not fetch-all-then-shuffle in JS) so this stays cheap as the
// question catalog grows.
export async function listEligibleQuestionsForEdition(enabledFormats: string[], limit: number) {
  return db
    .select({ id: questions.id })
    .from(questions)
    .innerJoin(newsStories, eq(newsStories.id, questions.sourceStoryId))
    .where(
      and(
        eq(questions.status, "published"),
        eq(newsStories.status, "published"),
        inArray(questions.format, enabledFormats as (typeof questions.format.enumValues)[number][]),
      ),
    )
    .orderBy(sql`random()`)
    .limit(limit);
}

export async function getEditionByDate(dateIst: string) {
  const [row] = await db.select().from(newsEditions).where(eq(newsEditions.date, dateIst)).limit(1);
  return row ?? null;
}

export async function getEditionById(id: string) {
  const [row] = await db.select().from(newsEditions).where(eq(newsEditions.id, id)).limit(1);
  return row ?? null;
}

// Idempotent on `date` (news_editions.date is UNIQUE) - if two requests
// race to build today's edition, the second's insert simply conflicts and
// the caller re-reads the winner via getEditionByDate. This is what makes
// "one edition per IST day" a database guarantee, not an application-level
// check (same reasoning D26/D30 already give for every other idempotent
// write in this codebase).
export async function insertEditionIfNew(dateIst: string, questionIds: string[]) {
  const [row] = await db
    .insert(newsEditions)
    .values({ date: dateIst, questionIds, published: true })
    .onConflictDoNothing({ target: newsEditions.date })
    .returning();
  return row ?? null;
}

export async function getInProgressAttempt(userId: string, editionId: string) {
  const [row] = await db
    .select()
    .from(pulseCheckAttempts)
    .where(
      and(
        eq(pulseCheckAttempts.userId, userId),
        eq(pulseCheckAttempts.editionId, editionId),
        eq(pulseCheckAttempts.status, "in_progress"),
      ),
    )
    .orderBy(desc(pulseCheckAttempts.startedAt))
    .limit(1);
  return row ?? null;
}

export async function getCompletedAttemptForEdition(userId: string, editionId: string) {
  const [row] = await db
    .select()
    .from(pulseCheckAttempts)
    .where(
      and(
        eq(pulseCheckAttempts.userId, userId),
        eq(pulseCheckAttempts.editionId, editionId),
        eq(pulseCheckAttempts.status, "completed"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getAttemptById(id: string) {
  const [row] = await db.select().from(pulseCheckAttempts).where(eq(pulseCheckAttempts.id, id)).limit(1);
  return row ?? null;
}

export async function insertAttempt(userId: string, editionId: string) {
  const [row] = await db.insert(pulseCheckAttempts).values({ userId, editionId }).returning();
  return row;
}

export async function getAnswerByStep(attemptId: string, stepIndex: number) {
  const [row] = await db
    .select()
    .from(pulseCheckAnswers)
    .where(and(eq(pulseCheckAnswers.attemptId, attemptId), eq(pulseCheckAnswers.stepIndex, stepIndex)))
    .limit(1);
  return row ?? null;
}

export async function listAnswersForAttempt(attemptId: string) {
  return db
    .select()
    .from(pulseCheckAnswers)
    .where(eq(pulseCheckAnswers.attemptId, attemptId))
    .orderBy(pulseCheckAnswers.stepIndex);
}

// Idempotent re-serve: onConflictDoNothing on (attemptId, stepIndex), then
// a re-read, so a duplicate serve call for the same step returns the
// ORIGINAL servedAt rather than resetting the clock - same anti-cheat
// reasoning as D21's serveStep.
export async function insertServedAnswerIfNew(input: {
  attemptId: string;
  questionId: string;
  stepIndex: number;
  timerSeconds: number;
  servedRevision: number;
}) {
  await db
    .insert(pulseCheckAnswers)
    .values({ ...input, servedAt: new Date() })
    .onConflictDoNothing({ target: [pulseCheckAnswers.attemptId, pulseCheckAnswers.stepIndex] });
  return getAnswerByStep(input.attemptId, input.stepIndex);
}

// Atomic UPDATE ... WHERE answeredAt IS NULL - a duplicate/racing grade
// attempt for an already-answered step simply matches nothing and the
// caller re-reads the original result, never re-scoring (same D21
// idempotent-grading shape as question_answers).
export async function gradeAnswerRowIfUnanswered(
  attemptId: string,
  stepIndex: number,
  result: {
    submittedAnswer: unknown;
    isCorrect: boolean;
    timedOut: boolean;
    speedBonusAwarded: boolean;
    comboAfter: number;
    vmAwardedPaise: number;
  },
) {
  const [row] = await db
    .update(pulseCheckAnswers)
    .set({ ...result, answeredAt: new Date() })
    .where(
      and(
        eq(pulseCheckAnswers.attemptId, attemptId),
        eq(pulseCheckAnswers.stepIndex, stepIndex),
        sql`${pulseCheckAnswers.answeredAt} IS NULL`,
      ),
    )
    .returning();
  return row ?? null;
}

export async function markAttemptCompleted(
  attemptId: string,
  result: {
    accuracyPct: number;
    bestCombo: number;
    allCorrectBonusAwarded: boolean;
    rawVmEarnedPaise: number;
    totalVmAwardedPaise: number;
    dailyCapReached: boolean;
  },
) {
  const [row] = await db
    .update(pulseCheckAttempts)
    .set({ ...result, status: "completed", completedAt: new Date() })
    .where(and(eq(pulseCheckAttempts.id, attemptId), eq(pulseCheckAttempts.status, "in_progress")))
    .returning();
  return row ?? null;
}

// How much Pulse Check VM this user has already been credited today (IST),
// for D51's daily cap. Sums vmoney_ledger directly (never a stored running
// total, same "always derived live" reasoning as every other balance in
// this codebase) - scoped to sourceType so it only ever counts Pulse Check
// credits, never lesson/reward/other VM.
export async function sumPulseCheckVmCreditedToday(userId: string, at: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string | number>`coalesce(sum(${vmoneyLedger.amountPaise}), 0)` })
    .from(vmoneyLedger)
    .where(
      and(
        eq(vmoneyLedger.userId, userId),
        eq(vmoneyLedger.sourceType, "pulse_check_attempt"),
        gte(vmoneyLedger.createdAt, istDateStartUtc(at)),
      ),
    );
  return Number(row?.total ?? 0);
}

// Question content + its answer key at the exact revision served -
// mirrors src/server/quiz-attempts/repo.ts's getQuestionRevision usage,
// same D22 reasoning (grade against the snapshot, never the live row, so a
// hotfix landing mid-attempt can't change what an in-flight answer is
// graded against).
export async function getQuestionForServing(questionId: string) {
  const [row] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  return row ?? null;
}

export async function getQuestionRevisionForGrading(questionId: string, revision: number) {
  const [row] = await db
    .select()
    .from(questionRevisions)
    .where(and(eq(questionRevisions.questionId, questionId), eq(questionRevisions.revision, revision)))
    .limit(1);
  return row ?? null;
}

// Story headline for NW-13's "shows its source headline" requirement - a
// snapshot read at serve time (a story hidden after this question was
// already served doesn't retroactively change what the learner sees mid-
// attempt), never a live dependency the result view needs later.
export async function getStoryHeadline(storyId: string) {
  const [row] = await db.select({ content: newsStories.content }).from(newsStories).where(eq(newsStories.id, storyId)).limit(1);
  return row?.content.headline ?? null;
}

// NW-43's 7-day engagement chart: distinct completed-attempt user count per
// IST day, for the caller to divide by the active user count. One grouped
// query (never one per day) - `date_trunc('day', completed_at AT TIME ZONE
// 'Asia/Kolkata')` buckets in IST directly in SQL, matching this codebase's
// fixed-offset IST convention (D30 - India has no DST, so this is a
// permanent, cheap conversion, not a timezone-database lookup).
export async function getDailyCompletedAttemptCounts(sinceUtc: Date) {
  const rows = await db
    .select({
      istDate: sql<string>`to_char(${pulseCheckAttempts.completedAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`,
      distinctUsers: sql<string | number>`count(distinct ${pulseCheckAttempts.userId})`,
    })
    .from(pulseCheckAttempts)
    .where(and(eq(pulseCheckAttempts.status, "completed"), gte(pulseCheckAttempts.completedAt, sinceUtc)))
    .groupBy(sql`1`);
  return rows.map((r) => ({ date: r.istDate, distinctUsers: Number(r.distinctUsers) }));
}

// The denominator for "% of users who did Pulse Check" - active (non-
// deleted) users only, a single count, not tracked historically per day
// (same simplification the Ops console's KPIs already make for their own
// population scoping, D48).
export async function getActiveUserCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users).where(isNull(users.deletedAt));
  return row?.n ?? 0;
}
