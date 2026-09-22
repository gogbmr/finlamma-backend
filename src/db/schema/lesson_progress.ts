import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { lessons } from "./lessons";
import { users } from "./users";

export const lessonProgressStatusEnum = pgEnum("lesson_progress_status", ["in_progress", "completed"]);

// One row per (user, lesson) - Checkpoint 6's world-unlock check and the
// admin unpublish-warning both read this. Written by
// src/server/quiz-attempts/service.ts: serveStep starts it (on a lesson's
// first-ever attempt), submitAnswer completes it (once the attempt
// finishes) - so today this only ever gets a row for a lesson kind that
// goes through quiz_attempts (video/quiz/boss_quiz/role_play, i.e. every
// kind with at least one graded step). story/doubt_zone lessons have no
// graded steps and no other "mark as done" endpoint yet, so they never get
// a row here - that's a known gap (docs/ARCHITECTURE.md D23), not a bug:
// nothing can be "in progress" on a lesson kind with no interaction
// endpoint at all.
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "restrict" }),
    status: lessonProgressStatusEnum("status").default("in_progress").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("lesson_progress_user_lesson_idx").on(t.userId, t.lessonId),
    index("lesson_progress_lesson_id_idx").on(t.lessonId),
  ],
).enableRLS();
