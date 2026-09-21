import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { staffMembers } from "./staff";

export const questionFormatEnum = pgEnum("question_format", [
  "single_select",
  "ordering",
  "sort_buckets",
  "fill_blank",
  "match_pairs",
  "spot_mistake",
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
    topic: text("topic"), // fixed admin-extensible taxonomy (see NW gap #4) - refined later
    prompt: jsonb("prompt").$type<LocalizedText>().notNull(),
    explanation: jsonb("explanation").$type<LocalizedText>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    answer: jsonb("answer").$type<unknown>().notNull(),
    // Bumped on every hotfix (src/server/questions/service.ts's
    // hotfixQuestion) that changes payload/answer on an already-published
    // question - never on a draft edit or publish itself. question_answers
    // (Checkpoint 5b) stamps this value onto each graded answer so it's
    // always known which revision a historical attempt was graded against,
    // even after a later hotfix changes the answer key. See
    // docs/ARCHITECTURE.md D20.
    revision: integer("revision").default(1).notNull(),
    status: questionStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("questions_status_idx").on(t.status)],
).enableRLS();
