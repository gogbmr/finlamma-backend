import { and, asc, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  coachNoteTemplates,
  lessonProgress,
  lessons,
  questionAnswers,
  questions,
  quizAttempts,
  reportSnapshots,
  users,
} from "@/db/schema";
import type { LocalizedText } from "@/db/schema/_helpers";
import type { EfficiencySubMetrics, ModuleBreakdownRow, TopicMasteryRow } from "@/db/schema/report_card";

// The user's ENTIRE answered-question history with topic - not scoped to
// one week - because retention (docs/PRODUCT_SPEC.md §6) needs to know
// whether THIS week's answer on a topic is the learner's first-ever
// exposure to it or a repeat of something answered earlier, which requires
// looking further back than the report window itself. Ordered oldest-first
// so the metrics layer can find each topic's first-occurrence timestamp in
// one pass. `topic` is nullable (not every question is tagged yet) -
// callers filter those out before computing topic-based metrics.
export async function listAnsweredQuestionHistoryForUser(userId: string) {
  return db
    .select({
      answeredAt: questionAnswers.answeredAt,
      topic: questions.topic,
      isCorrect: questionAnswers.isCorrect,
    })
    .from(questionAnswers)
    .innerJoin(quizAttempts, eq(quizAttempts.id, questionAnswers.attemptId))
    .innerJoin(questions, eq(questions.id, questionAnswers.questionId))
    .where(and(eq(quizAttempts.userId, userId), isNotNull(questionAnswers.answeredAt)))
    .orderBy(asc(questionAnswers.answeredAt));
}

// Video-kind attempts completed within [since, until) - the watch-speed
// sub-metric's data source. `startedAt`/`completedAt` is a wall-clock proxy
// for "time spent watching" (it also includes any in-video pop-quiz
// answering time mixed in) - the closest real signal available without a
// dedicated per-video watch timer; see src/server/report-card/metrics.ts's
// comment on this approximation.
export async function listCompletedVideoAttemptsForUserInRange(userId: string, since: Date, until: Date) {
  return db
    .select({
      startedAt: quizAttempts.startedAt,
      completedAt: quizAttempts.completedAt,
      content: lessons.content,
    })
    .from(quizAttempts)
    .innerJoin(lessons, eq(lessons.id, quizAttempts.lessonId))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        eq(lessons.kind, "video"),
        eq(quizAttempts.status, "completed"),
        gte(quizAttempts.completedAt, since),
        lt(quizAttempts.completedAt, until),
      ),
    );
}

// Every graded-lesson-kind completion (video/quiz/boss_quiz/role_play) this
// week, with its world and a wall-clock duration proxy for "time spent" -
// the module breakdown's (PR-31) data source for those kinds.
export async function listCompletedGradedLessonsForUserInRange(userId: string, since: Date, until: Date) {
  return db
    .select({
      worldId: lessons.worldId,
      lessonId: lessons.id,
      startedAt: quizAttempts.startedAt,
      completedAt: quizAttempts.completedAt,
    })
    .from(quizAttempts)
    .innerJoin(lessons, eq(lessons.id, quizAttempts.lessonId))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        eq(quizAttempts.status, "completed"),
        gte(quizAttempts.completedAt, since),
        lt(quizAttempts.completedAt, until),
      ),
    );
}

// Same as above, for the ungraded kinds (story/doubt_zone), which live in
// lesson_progress instead of quiz_attempts (D23/D29).
export async function listCompletedUngradedLessonsForUserInRange(userId: string, since: Date, until: Date) {
  return db
    .select({
      worldId: lessons.worldId,
      lessonId: lessons.id,
      startedAt: lessonProgress.startedAt,
      completedAt: lessonProgress.completedAt,
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, "completed"),
        gte(lessonProgress.completedAt, since),
        lt(lessonProgress.completedAt, until),
      ),
    );
}

// Graded answers this week, with each one's world - the module breakdown's
// (PR-31) per-world accuracy source.
export async function listAnsweredQuestionsWithWorldForUserInRange(userId: string, since: Date, until: Date) {
  return db
    .select({
      worldId: lessons.worldId,
      isCorrect: questionAnswers.isCorrect,
    })
    .from(questionAnswers)
    .innerJoin(quizAttempts, eq(quizAttempts.id, questionAnswers.attemptId))
    .innerJoin(lessons, eq(lessons.id, quizAttempts.lessonId))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        isNotNull(questionAnswers.answeredAt),
        gte(questionAnswers.answeredAt, since),
        lt(questionAnswers.answeredAt, until),
      ),
    );
}

// The weekly Inngest job's iteration set - every non-deleted user, matching
// every other per-user background job's scope in this codebase.
export async function listActiveUsersForReportCard(): Promise<{ id: string; dateOfBirth: string | null }[]> {
  return db.select({ id: users.id, dateOfBirth: users.dateOfBirth }).from(users).where(isNull(users.deletedAt));
}

export type CoachNoteCategory = "strength" | "gap" | "opportunity" | "habit";

export async function getPublishedCoachNoteTemplatesByCategory(category: CoachNoteCategory) {
  return db
    .select()
    .from(coachNoteTemplates)
    .where(and(eq(coachNoteTemplates.category, category), eq(coachNoteTemplates.status, "published")));
}

export async function listAllCoachNoteTemplates() {
  return db.select().from(coachNoteTemplates).orderBy(asc(coachNoteTemplates.category));
}

export async function getCoachNoteTemplateById(id: string) {
  const [row] = await db.select().from(coachNoteTemplates).where(eq(coachNoteTemplates.id, id)).limit(1);
  return row ?? null;
}

export async function insertDraftCoachNoteTemplate(input: { category: CoachNoteCategory; template: LocalizedText }) {
  const [row] = await db.insert(coachNoteTemplates).values(input).returning();
  return row;
}

export async function updateDraftCoachNoteTemplate(input: {
  id: string;
  category: CoachNoteCategory;
  template: LocalizedText;
}) {
  const { id, ...rest } = input;
  const [row] = await db.update(coachNoteTemplates).set(rest).where(eq(coachNoteTemplates.id, id)).returning();
  return row ?? null;
}

export async function publishCoachNoteTemplateRow(id: string, staffId: string) {
  const [row] = await db
    .update(coachNoteTemplates)
    .set({ status: "published", publishedAt: new Date(), publishedBy: staffId })
    .where(eq(coachNoteTemplates.id, id))
    .returning();
  return row ?? null;
}

export async function unpublishCoachNoteTemplateRow(id: string) {
  const [row] = await db
    .update(coachNoteTemplates)
    .set({ status: "draft", publishedAt: null, publishedBy: null })
    .where(eq(coachNoteTemplates.id, id))
    .returning();
  return row ?? null;
}

export async function insertReportSnapshot(input: {
  userId: string;
  weekStartDate: string;
  efficiencyScore: number;
  subMetrics: EfficiencySubMetrics;
  moduleBreakdown: ModuleBreakdownRow[];
  topicMastery: TopicMasteryRow[];
  strengthNoteId: string | null;
  gapNoteId: string | null;
  opportunityNoteId: string | null;
  habitNoteId: string | null;
  opportunityTopic: { topic: string; accuracyPct: number } | null;
  habitDetail: { bestWeekday: string | null; streakBroken: boolean } | null;
}) {
  const [row] = await db
    .insert(reportSnapshots)
    .values(input)
    .onConflictDoNothing({ target: [reportSnapshots.userId, reportSnapshots.weekStartDate] })
    .returning();
  return row ?? null;
}

export async function getReportSnapshot(userId: string, weekStartDate: string) {
  const [row] = await db
    .select()
    .from(reportSnapshots)
    .where(and(eq(reportSnapshots.userId, userId), eq(reportSnapshots.weekStartDate, weekStartDate)))
    .limit(1);
  return row ?? null;
}

// Newest-first, up to `limit` weeks - PR-32's 8-week trend chart reverses
// this to display oldest-to-newest, left-to-right.
export async function listReportSnapshotsForUser(userId: string, limit: number) {
  return db
    .select()
    .from(reportSnapshots)
    .where(eq(reportSnapshots.userId, userId))
    .orderBy(desc(reportSnapshots.weekStartDate))
    .limit(limit);
}
