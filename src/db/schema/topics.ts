import { boolean, integer, jsonb, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";

// Phase 5 kickoff: the one shared topic taxonomy for both a question's
// mastery-bar topic (questions.topicId, replacing the old free-text
// questions.topic - see docs/ARCHITECTURE.md D18's original "refined later"
// note) and a news story's Pulse-Check-relevant topic (news_stories.topicId)
// - one admin-editable table instead of two drifting free-text fields.
// Seeded from the prototype's own TOPIC_MAP (Finlamma App.dc.html:7515):
// RBI & rates, Afwah pehchano, Inflation, Market impact, Financial terms,
// Soch-samajh - see scripts/seed-topics.ts. No draft/publish workflow (unlike
// mentors/worlds/questions) - a topic is reference data, not learner-facing
// content requiring review, same reasoning as rank_titles.
//
// Deliberately NOT the same list as news_stories.category (NW-04's feed
// filter chips - RBI, Stocks, Company, Global, IPO, Economy, ...): category
// is a coarser feed-navigation concept, topic is the finer pedagogical
// skill-grouping concept the report card and Pulse Check mastery bars roll
// up by. Conflating them would have made the mastery bars (NW-32) more
// useful for browsing news than for measuring what a learner is actually
// getting wrong.
export const topics = pgTable(
  "topics",
  {
    ...idAndTimestamps(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    order: integer("order").notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [uniqueIndex("topics_order_idx").on(t.order)],
).enableRLS();
