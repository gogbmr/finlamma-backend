import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { newsEditions } from "./news";
import { questions } from "./questions";
import { users } from "./users";

export const pulseCheckAttemptStatusEnum = pgEnum("pulse_check_attempt_status", ["in_progress", "completed"]);

// Mirrors quiz_attempts/question_answers' server-timed, idempotent shape
// (docs/ARCHITECTURE.md D21) but scoped to a news edition, not a lesson -
// there is no real `quizzes` table to reuse (docs/DATA_MODEL.md's
// description of one predates the actual Phase 2b/3 build, which uses
// quiz_attempts + questions + id-references instead). `totalVmAwardedPaise`
// is set once, at finish, from the sum of every answer's own
// vmAwardedPaise plus the all-correct bonus - never recomputed on replay.
export const pulseCheckAttempts = pgTable(
  "pulse_check_attempts",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => newsEditions.id, { onDelete: "restrict" }),
    status: pulseCheckAttemptStatusEnum("status").default("in_progress").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    accuracyPct: integer("accuracy_pct"),
    bestCombo: integer("best_combo"),
    allCorrectBonusAwarded: boolean("all_correct_bonus_awarded"),
    totalVmAwardedPaise: bigint("total_vm_awarded_paise", { mode: "number" }),
  },
  (t) => [
    index("pulse_check_attempts_user_edition_idx").on(t.userId, t.editionId),
    index("pulse_check_attempts_status_idx").on(t.status),
  ],
).enableRLS();

// One row per graded question within an attempt - same server-timed,
// no-skip-ahead, no-answer-leak design as question_answers (D21).
// `servedRevision` is questions.revision at serve time, graded against
// question_revisions, never the live questions row (D22).
export const pulseCheckAnswers = pgTable(
  "pulse_check_answers",
  {
    ...idAndTimestamps(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => pulseCheckAttempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "restrict" }),
    stepIndex: integer("step_index").notNull(),
    servedAt: timestamp("served_at", { withTimezone: true }).notNull(),
    timerSeconds: integer("timer_seconds").notNull(),
    servedRevision: integer("question_revision").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    submittedAnswer: jsonb("submitted_answer").$type<unknown>(),
    isCorrect: boolean("is_correct"),
    timedOut: boolean("timed_out"),
    speedBonusAwarded: boolean("speed_bonus_awarded"),
    comboAfter: integer("combo_after"),
    vmAwardedPaise: bigint("vm_awarded_paise", { mode: "number" }),
  },
  (t) => [
    uniqueIndex("pulse_check_answers_attempt_step_idx").on(t.attemptId, t.stepIndex),
    index("pulse_check_answers_attempt_id_idx").on(t.attemptId),
  ],
).enableRLS();
