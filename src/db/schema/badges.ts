import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { staffMembers } from "./staff";
import { users } from "./users";

export const badgeStatusEnum = pgEnum("badge_status", ["draft", "published"]);
// Display taxonomy only (PR-17's filter chips) - separate from `criteria.type`
// (what math actually unlocks it, src/server/badges/evaluators.ts). A
// "trading"/"news" badge can exist here for display grouping before Phase
// 4/5 ship a matching evaluator - it just can never actually unlock until
// one exists to evaluate it.
export const badgeCategoryEnum = pgEnum("badge_category", ["learning", "streak", "trading", "news"]);

// Admin-editable, unbounded content type - same D25 shape as
// mentors/worlds. `criteria` is a small, extensible {type, threshold} shape
// (src/server/badges/schemas.ts) - adding a new criteria TYPE needs a new
// evaluator (a code change); the badges staff actually create from existing
// types is pure data. `vmReward` is bounds-checked at the schema layer
// (MAX_BADGE_VM_REWARD) the same way reward_rules' amounts already are.
// `iconKey` is a free-text identifier the app maps to a bundled icon asset,
// not an uploaded image - v1 doesn't need per-badge custom art.
export const badges = pgTable(
  "badges",
  {
    ...idAndTimestamps(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    description: jsonb("description").$type<LocalizedText>().notNull(),
    category: badgeCategoryEnum("category").notNull(),
    criteria: jsonb("criteria").$type<{ type: string; threshold: number }>().notNull(),
    vmReward: integer("vm_reward").notNull(),
    iconKey: text("icon_key"),
    status: badgeStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("badges_status_idx").on(t.status)],
).enableRLS();

// One row per (user, badge), written once, ever - evaluateBadgesForUser
// (src/server/badges/service.ts) relies on the unique index below for
// idempotency (same insert-and-treat-conflict-as-done pattern as
// xp_events/vmoney_ledger/certificates, D26): re-running criteria
// evaluation for a user who already has a badge is always a silent no-op,
// never a second award.
export const userBadges = pgTable(
  "user_badges",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeId: uuid("badge_id")
      .notNull()
      .references(() => badges.id, { onDelete: "restrict" }),
  },
  (t) => [uniqueIndex("user_badges_user_badge_idx").on(t.userId, t.badgeId)],
).enableRLS();
