import {
  boolean,
  date,
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
import { users } from "./users";

// Feed-navigation taxonomy (NW-04's category filter chips) - deliberately a
// separate, coarser concept from a story's `topicId` (see topics.ts's own
// comment on why the two aren't merged). Fixed set from docs/DATA_MODEL.md;
// "fixed admin-extensible" here means extended by a future migration adding
// an enum value, not a runtime-editable table, since a feed filter chip set
// changing is a rare, deliberate content decision, unlike a topic.
export const newsCategoryEnum = pgEnum("news_category", [
  "rbi_rates",
  "inflation",
  "stock_market_basics",
  "ipos_new_listings",
  "mutual_funds",
  "banking",
  "scams_fraud",
  "government_budget",
  "global_markets",
  "currency",
]);
export const newsImpactEnum = pgEnum("news_impact", ["good", "bad", "neutral"]);
export const newsQualityGradeEnum = pgEnum("news_quality_grade", ["A", "B", "C"]);
// "hidden" is distinct from "draft": a story that was live and got pulled
// (a bad item published fast per the founder's constraint) vs. one that was
// never reviewed yet - both are equally invisible to GET /v1/news/feed, but
// the News Desk pipeline shows them differently (NW-37).
export const newsStoryStatusEnum = pgEnum("news_story_status", ["draft", "published", "hidden"]);
export const newsDeskPickKindEnum = pgEnum("news_desk_pick_kind", ["desk_pick", "exam_alert", "scam_watch"]);

// Raw ingested items - never learner-visible, no status field at all. Source
// is a provider key ("mock" | "finnhub" | ... - see
// src/server/news/providers), never touched again once a news_stories draft
// is generated from it (docs/ARCHITECTURE.md's mock-provider decision).
export const newsRaw = pgTable(
  "news_raw",
  {
    ...idAndTimestamps(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    headline: text("headline").notNull(),
    summary: text("summary").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [uniqueIndex("news_raw_source_external_id_idx").on(t.source, t.externalId)],
).enableRLS();

// AI-drafted, staff-published story. `status` defaults to "draft" and no
// code path anywhere flips it except a staff PATCH
// (src/server/news/service.ts) - this is what makes CLAUDE.md rule 11 ("AI
// output is a draft until a staff member publishes it") true by
// construction, not convention. `adviceLikeWarnings` is
// findAdviceLikePhrases' output against this story's drafted text
// (src/server/trading/advice-language.ts, reused from the instrument-tip
// guardrail) - staff-visible only, never blocking, never shown to a learner.
export const newsStories = pgTable(
  "news_stories",
  {
    ...idAndTimestamps(),
    rawId: uuid("raw_id").references(() => newsRaw.id, { onDelete: "set null" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    category: newsCategoryEnum("category").notNull(),
    impact: newsImpactEnum("impact").notNull(),
    content: jsonb("content")
      .$type<{ headline: LocalizedText; summary: LocalizedText; body: LocalizedText[] }>()
      .notNull(),
    jargon: jsonb("jargon").$type<{ term: LocalizedText; explanation: LocalizedText }>(),
    outlet: text("outlet").notNull(), // attribution shown on every card/detail (NW-11)
    sourceUrl: text("source_url").notNull(),
    qualityGrade: newsQualityGradeEnum("quality_grade").notNull(), // auto heuristic
    qualityGradeOverride: newsQualityGradeEnum("quality_grade_override"), // staff override (NW-37)
    featured: boolean("featured").default(false).notNull(),
    adviceLikeWarnings: jsonb("advice_like_warnings").$type<string[]>(),
    status: newsStoryStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, { onDelete: "set null" }),
    // Phase 7's market_news push notification: set once the broadcast
    // Inngest job (src/inngest/functions/news-notification-broadcast.ts)
    // has fanned this story out, so a retried/rescheduled run never
    // notifies the same story twice. Null for every story published
    // before Phase 7 existed and for any story never published.
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    index("news_stories_status_idx").on(t.status),
    index("news_stories_topic_id_idx").on(t.topicId),
    index("news_stories_category_idx").on(t.category),
  ],
).enableRLS();

// One row per IST calendar day, holding that day's ordered Pulse Check
// question-id list - the same "reference by id, content lives elsewhere"
// pattern lessons.content already uses for lesson quizzes
// (docs/ARCHITECTURE.md D18), since no real `quizzes` table exists to hang
// this off (docs/DATA_MODEL.md's description of one predates the actual
// Phase 2b/3 build). `date` matches streaks.lastActiveDateIst's convention:
// an IST calendar date computed server-side, stored as a bare string.
export const newsEditions = pgTable(
  "news_editions",
  {
    ...idAndTimestamps(),
    date: date("date", { mode: "string" }).notNull().unique(),
    questionIds: jsonb("question_ids").$type<string[]>().notNull().default([]),
    published: boolean("published").default(false).notNull(),
  },
).enableRLS();

// Backs the "read" badge (NW-07) and any future read-gating on Pulse Check.
// dwellSeconds is server-validated against the story's stated read-duration
// before this row is written (never a bare client "I read it" signal).
export const newsReads = pgTable(
  "news_reads",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storyId: uuid("story_id")
      .notNull()
      .references(() => newsStories.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
    dwellSeconds: integer("dwell_seconds").notNull(),
  },
  (t) => [uniqueIndex("news_reads_user_story_idx").on(t.userId, t.storyId)],
).enableRLS();

// Staff-authored highlights (Desk Pick / Exam Alert / Scam Watch) - entirely
// separate from the AI/ingestion pipeline above (NW-05/NW-46). Either points
// at an existing published story or carries its own standalone content, not
// both. No automated-content risk on this surface at all: nothing but a
// staff member's own CRUD action ever writes a row here.
export const newsDeskPicks = pgTable(
  "news_desk_picks",
  {
    ...idAndTimestamps(),
    kind: newsDeskPickKindEnum("kind").notNull(),
    storyId: uuid("story_id").references(() => newsStories.id, { onDelete: "set null" }),
    content: jsonb("content").$type<{ title: LocalizedText; body: LocalizedText } | null>(),
    attribution: text("attribution"),
    active: boolean("active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => staffMembers.id, { onDelete: "set null" }),
  },
  (t) => [index("news_desk_picks_active_idx").on(t.active)],
).enableRLS();
