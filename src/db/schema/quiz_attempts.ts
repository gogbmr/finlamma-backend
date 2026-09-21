import { boolean, index, integer, jsonb, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { lessons } from "./lessons";
import { questions } from "./questions";
import { users } from "./users";

export const quizAttemptStatusEnum = pgEnum("quiz_attempt_status", ["in_progress", "completed"]);

// One row per learner run through a lesson's graded steps (a video's
// in-video pop quizzes, or a quiz/boss_quiz/role_play's question list -
// story and doubt_zone lessons never have one, see
// src/server/lessons/service.ts's extractQuestionIds). `attemptNumber` and
// `isFirstPass` exist purely for Phase 3's future anti-farming rules (D17,
// docs/ARCHITECTURE.md) - this phase only computes/stores them, never
// credits anything from them. `totalXpPreview` is filled once `status`
// flips to "completed" - see src/server/quiz-attempts/service.ts.
export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    isFirstPass: boolean("is_first_pass").notNull(),
    status: quizAttemptStatusEnum("status").default("in_progress").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    totalXpPreview: integer("total_xp_preview"),
  },
  (t) => [
    index("quiz_attempts_user_lesson_idx").on(t.userId, t.lessonId),
    index("quiz_attempts_status_idx").on(t.status),
  ],
).enableRLS();

// One row per graded step within an attempt. `servedAt` is the
// server-stamped moment the question was actually handed to the client
// (src/server/quiz-attempts/service.ts's serveStep) - the client's own
// clock is never trusted for timing, see docs/ARCHITECTURE.md D21.
// `submittedAnswer`/`isCorrect`/`timedOut`/`speedBonusAwarded`/
// `feverActive`/`xpAwardedPreview`/`comboAfter` stay null until answered;
// `answeredAt` null is exactly what makes a step "the current, answerable
// one" (see the service layer's no-skip-ahead check). `timedOut`/
// `speedBonusAwarded`/`feverActive` are stored (not just derived from
// `xpAwardedPreview`) so a duplicate/idempotent resubmit can return the
// exact original graded response even if admin-editable scoring settings
// (settings_kv) changed in between - a replay must never look inconsistent
// with what the learner actually saw the first time. `questionRevision` is
// `questions.revision` (D20) at grading time, so a
// later hotfix to the answer key never changes what a past attempt is
// understood to have been graded against.
export const questionAnswers = pgTable(
  "question_answers",
  {
    ...idAndTimestamps(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    stepIndex: integer("step_index").notNull(), // 1-based position within the lesson's question sequence
    servedAt: timestamp("served_at", { withTimezone: true }).notNull(),
    timerSeconds: integer("timer_seconds").notNull(), // allotted time, captured at serve time
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    submittedAnswer: jsonb("submitted_answer").$type<unknown>(),
    isCorrect: boolean("is_correct"),
    timedOut: boolean("timed_out"),
    speedBonusAwarded: boolean("speed_bonus_awarded"),
    feverActive: boolean("fever_active"),
    xpAwardedPreview: integer("xp_awarded_preview"),
    comboAfter: integer("combo_after"),
    questionRevision: integer("question_revision"),
  },
  (t) => [
    uniqueIndex("question_answers_attempt_step_idx").on(t.attemptId, t.stepIndex),
    index("question_answers_attempt_id_idx").on(t.attemptId),
  ],
).enableRLS();
