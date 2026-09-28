import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { staffMembers } from "./staff";
import { topics } from "./topics";

export const questionFormatEnum = pgEnum("question_format", [
  "single_select",
  "ordering",
  "sort_buckets",
  "fill_blank",
  "match_pairs",
  "spot_mistake",
  // Phase 5: Pulse Check's "Number Pakdo" slider - the one prototype format
  // with no existing equivalent (single_select already covers MCQ/binary/
  // odd-one-out by original Phase 2b design - see this file's own comment
  // on single_select in src/server/questions/schemas.ts).
  "number_guess",
]);
export const questionStatusEnum = pgEnum("question_status", ["draft", "published"]);

// Single source of truth for every question a lesson references (an
// in-video pop-quiz cue, a quiz/boss_quiz/role_play question list) - see
// docs/ARCHITECTURE.md D18 and docs/DATA_MODEL.md's Learning section. A
// lesson's content never embeds a question's payload, only its id.
//
// `answer` is deliberately a separate column from `payload`: the correct
// answer (an index/mapping/order - see src/server/questions/schemas.ts's
// per-format answer shapes) is language-independent, one shared value, and
// is never sent to the app before a question is graded - the two being
// separate columns is what makes "select payload without answer" trivial
// and safe by construction, not something a projection function has to get
// right every time. `explanation` is shown only after grading, same
// leak-prevention reasoning.
export const questions = pgTable(
  "questions",
  {
    ...idAndTimestamps(),
    format: questionFormatEnum("format").notNull(),
    // Deprecated by Phase 5's `topics` table (topicId, below) - kept
    // nullable and unread by any new code so main's pre-Phase-5 code (which
    // doesn't exist - nothing has ever written a real value here, verified
    // empty in production) has nothing to lose. Dropped in a follow-up
    // migration once this phase's code is confirmed deployed to main, per
    // CLAUDE.md rule 8.
    topic: text("topic"),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    prompt: jsonb("prompt").$type<LocalizedText>().notNull(),
    explanation: jsonb("explanation").$type<LocalizedText>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    answer: jsonb("answer").$type<unknown>().notNull(),
    // Bumped by every publish (src/server/questions/service.ts's
    // publishQuestion) and every hotfix (hotfixQuestion, D20) that changes
    // payload/answer on an already-published question - never on a plain
    // draft edit. Starts at 0 (a draft that's never gone live has no
    // meaningful revision) and becomes 1 on first publish. Every value this
    // column ever takes has a matching questionRevisions row below - see
    // D21/D22, docs/ARCHITECTURE.md.
    revision: integer("revision").default(0).notNull(),
    status: questionStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("questions_status_idx").on(t.status), index("questions_topic_id_idx").on(t.topicId)],
).enableRLS();

// Full-content snapshot of a question at one revision (D22,
// docs/ARCHITECTURE.md): written every time `questions`' live content
// changes (publishQuestionRow, hotfixQuestionRow) - never on a draft edit,
// since a draft isn't live yet. This is what makes every revision a
// `question_answers.servedRevision` might point to actually recoverable:
// the live `questions` row only ever holds the CURRENT content, so without
// this table a hotfix would silently make a past revision's exact
// prompt/payload/answer unrecoverable. Append-only - a revision snapshot is
// never updated or deleted once written.
export const questionRevisions = pgTable(
  "question_revisions",
  {
    ...idAndTimestamps(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    prompt: jsonb("prompt").$type<LocalizedText>().notNull(),
    explanation: jsonb("explanation").$type<LocalizedText>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    answer: jsonb("answer").$type<unknown>().notNull(),
  },
  (t) => [uniqueIndex("question_revisions_question_id_revision_idx").on(t.questionId, t.revision)],
).enableRLS();
