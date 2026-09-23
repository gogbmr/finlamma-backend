import { integer, jsonb, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";

// Admin-editable rank-title ladder (Profile Overview, PR-01) - staff rename
// or re-tier titles without a deploy, same reasoning as reward_rules being
// a table instead of a hardcoded constant (docs/ECONOMY.md). A learner's
// displayed rank title is "the title with the highest minLevel <= their
// current level" (src/server/rank-titles/repo.ts's getRankTitleForLevel) -
// there's no separate `order` column because minLevel itself is the order.
// Level is never stored anywhere (src/server/leveling computes it from
// total XP on every read), so this table is keyed on level, not XP directly.
export const rankTitles = pgTable(
  "rank_titles",
  {
    ...idAndTimestamps(),
    minLevel: integer("min_level").notNull(),
    title: jsonb("title").$type<LocalizedText>().notNull(),
  },
  (t) => [uniqueIndex("rank_titles_min_level_idx").on(t.minLevel)],
).enableRLS();
