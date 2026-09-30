import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { lessons } from "./lessons";
import { mentors } from "./mentors";
import { staffMembers } from "./staff";
import { users } from "./users";

// Phase 7's live "Ask Lamma AI" mentor (docs/ARCHITECTURE.md D6,
// PRODUCT_SPEC.md §1) - the upgrade path for the in-lesson `doubt_zone`
// lesson node (lessonId set) and the standalone Doubt Zone entry point
// (lessonId null, FEATURE_MAP SET-14). mentorId picks the persona voice
// (mentors.persona, staff-authored, never learner-visible) the AI answers
// in character as.
export const doubtThreads = pgTable(
  "doubt_threads",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mentorId: uuid("mentor_id")
      .notNull()
      .references(() => mentors.id, { onDelete: "restrict" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("doubt_threads_user_id_idx").on(t.userId)],
).enableRLS();

export const doubtMessageRoleEnum = pgEnum("doubt_message_role", ["learner", "assistant"]);

// A coarse, never-free-text label - safe to show in the moderation LIST
// view (src/server/doubt-zone/repo.ts's listFlaggedMessagesForReview),
// unlike flaggedReason below (which can contain a classifier-written
// paraphrase/quote of what the learner actually said, and stays gated
// behind the same logged reveal as `content` - /phase-audit 7 finding).
// "classifier_unavailable" (also /phase-audit 7) covers a message that
// couldn't be classified at all (e.g. an Anthropic outage) - flagged so a
// human still looks at it, since fail-closed only guarantees no AI reply
// was generated, not that the message was safe.
export const doubtMessageFlagCategoryEnum = pgEnum("doubt_message_flag_category", [
  "self_harm_or_suicide",
  "abuse_or_neglect",
  "other_wellbeing_concern",
  "classifier_unavailable",
  "learner_reported",
  "advice_language",
]);
export type DoubtMessageFlagCategory = (typeof doubtMessageFlagCategoryEnum.enumValues)[number];

// flagged/flaggedCategory/flaggedReason implement the phase-7-kickoff
// "flagged-only" staff visibility decision: full transcripts stay private
// by default (no doubt_zone.moderate-gated browsing of unflagged threads);
// a message is staff-visible ONLY when the safety classifier trips (or
// fails to run at all) on a learner message, the output-filter circuit
// breaker cuts a reply, or the learner taps "report this reply" on an
// assistant message. The safety-classifier sensitivity itself is
// settings_kv-editable (see src/server/doubt-zone/schemas.ts, Checkpoint 2)
// so it can be tuned without a redeploy.
export const doubtMessages = pgTable(
  "doubt_messages",
  {
    ...idAndTimestamps(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => doubtThreads.id, { onDelete: "cascade" }),
    role: doubtMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    flagged: boolean("flagged").default(false).notNull(),
    flaggedCategory: doubtMessageFlagCategoryEnum("flagged_category"),
    // Free text (a classifier-written reason, which can paraphrase/quote
    // the learner's own words, or a matched advice-phrase list) - NEVER
    // selected by the moderation list query, only by the logged reveal
    // action alongside `content`.
    flaggedReason: text("flagged_reason"),
    // Checkpoint 5's moderation queue (doubt_zone.moderate): a flagged
    // message stays in the pending queue until a staff member reviews it.
    // Reviewing never un-flags it (flagged/flaggedCategory/flaggedReason
    // stay as the permanent record of what tripped) - reviewedAt/reviewedBy
    // are purely "has a human looked at this yet", independent of the flag
    // itself.
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => staffMembers.id, { onDelete: "set null" }),
  },
  (t) => [
    index("doubt_messages_thread_id_created_at_idx").on(t.threadId, t.createdAt),
    index("doubt_messages_flagged_created_at_idx").on(t.flagged, t.createdAt),
  ],
).enableRLS();
