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

// flagged/flaggedReason implement the phase-7-kickoff "flagged-only" staff
// visibility decision: full transcripts stay private by default (no
// doubt_zone.moderate-gated browsing of unflagged threads); a message is
// staff-visible ONLY when the safety classifier trips on a learner message
// (flaggedReason e.g. "safety_classifier:<category>") or the learner taps
// "report this reply" on an assistant message (flaggedReason
// "learner_reported"). The safety-classifier sensitivity itself is
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
    flaggedReason: text("flagged_reason"),
    // Checkpoint 5's moderation queue (doubt_zone.moderate): a flagged
    // message stays in the pending queue until a staff member reviews it.
    // Reviewing never un-flags it (flagged/flaggedReason stay as the
    // permanent record of what tripped) - reviewedAt/reviewedBy are purely
    // "has a human looked at this yet", independent of the flag itself.
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => staffMembers.id, { onDelete: "set null" }),
  },
  (t) => [
    index("doubt_messages_thread_id_created_at_idx").on(t.threadId, t.createdAt),
    index("doubt_messages_flagged_created_at_idx").on(t.flagged, t.createdAt),
  ],
).enableRLS();
