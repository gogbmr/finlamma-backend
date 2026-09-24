import { date, integer, jsonb, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { staffMembers } from "./staff";
import { users } from "./users";

export const coachNoteCategoryEnum = pgEnum("coach_note_category", [
  "strength",
  "gap",
  "opportunity",
  "habit",
]);
export const coachNoteStatusEnum = pgEnum("coach_note_status", ["draft", "published"]);

// Admin-editable, draft -> publish like every other content type (D34,
// docs/ARCHITECTURE.md) - `template` holds {en,hi,hx} sentence templates
// with placeholders (e.g. "{{topic}}", "{{pct}}") the report-card job fills
// in with the learner's own real numbers, never AI-generated in v1
// (PRODUCT_SPEC.md §6). More than one published template can exist per
// category - src/server/report-card/coach-notes.ts picks one at random each
// week so the copy doesn't feel identical every time; if only one exists,
// that one is always used.
export const coachNoteTemplates = pgTable(
  "coach_note_templates",
  {
    ...idAndTimestamps(),
    category: coachNoteCategoryEnum("category").notNull(),
    template: jsonb("template").$type<LocalizedText>().notNull(),
    status: coachNoteStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, {
      onDelete: "set null",
    }),
  },
).enableRLS();

export type EfficiencySubMetrics = {
  retention: number;
  watchSpeed: number;
  quizAccuracy: number;
  consistency: number;
};

export type ModuleBreakdownRow = {
  worldId: string;
  worldTitle: string;
  lessonsCompleted: number;
  minutesSpent: number;
  accuracyPct: number;
  grade: "S" | "A" | "B" | "C";
};

export type TopicMasteryRow = {
  topic: string;
  accuracyPct: number;
};

// One row per (user, IST week-start-Monday), written by the weekly Inngest
// job (Monday IST) - PRODUCT_SPEC.md §6. A point-in-time snapshot, like
// certificates' xpEarned/accuracyPct - never recomputed after the fact, so
// changing the efficiency-score formula or a coach-note template later
// never rewrites history the learner already saw.
export const reportSnapshots = pgTable(
  "report_snapshots",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date").notNull(), // IST Monday, YYYY-MM-DD
    efficiencyScore: integer("efficiency_score").notNull(),
    subMetrics: jsonb("sub_metrics").$type<EfficiencySubMetrics>().notNull(),
    moduleBreakdown: jsonb("module_breakdown").$type<ModuleBreakdownRow[]>().notNull(),
    topicMastery: jsonb("topic_mastery").$type<TopicMasteryRow[]>().notNull(),
    strengthNoteId: uuid("strength_note_id").references(() => coachNoteTemplates.id, { onDelete: "set null" }),
    gapNoteId: uuid("gap_note_id").references(() => coachNoteTemplates.id, { onDelete: "set null" }),
    opportunityNoteId: uuid("opportunity_note_id").references(() => coachNoteTemplates.id, {
      onDelete: "set null",
    }),
    habitNoteId: uuid("habit_note_id").references(() => coachNoteTemplates.id, { onDelete: "set null" }),
    // The topic named in each note, if that note references one (Opportunity
    // always does; the others don't) - stored alongside the note id so the
    // template's {{topic}}/{{pct}} placeholders can be filled in when this
    // snapshot is displayed later, without recomputing anything.
    opportunityTopic: jsonb("opportunity_topic").$type<{ topic: string; accuracyPct: number } | null>(),
    habitDetail: jsonb("habit_detail").$type<{ bestWeekday: string | null; streakBroken: boolean } | null>(),
  },
  (t) => [uniqueIndex("report_snapshots_user_week_idx").on(t.userId, t.weekStartDate)],
).enableRLS();
