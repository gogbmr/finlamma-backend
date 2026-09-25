import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { staffMembers } from "./staff";
import { users } from "./users";

export const rewardStatusEnum = pgEnum("reward_status", ["draft", "published"]);
// v1 launches Finlamma-only (badges/titles/cosmetic themes, PRODUCT_SPEC.md
// §6) - `brand_partner` exists now so a real partner reward can be added
// later via admin CRUD, with no schema change, once partnerships exist.
export const rewardCategoryEnum = pgEnum("reward_category", ["finlamma", "brand_partner"]);

// `priceVm` is fixed and admin-set - never computed from the viewing user's
// own balance (that was a prototype UI trick, decided against - see
// docs/FEATURE_MAP.md's Profile gap #7). Bounds-checked at the schema layer
// (MAX_REWARD_PRICE_VM) same as every other admin-set VM amount in this
// codebase.
export const rewards = pgTable(
  "rewards",
  {
    ...idAndTimestamps(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    description: jsonb("description").$type<LocalizedText>().notNull(),
    category: rewardCategoryEnum("category").notNull(),
    priceVm: integer("price_vm").notNull(),
    iconKey: text("icon_key"),
    status: rewardStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("rewards_status_idx").on(t.status)],
).enableRLS();

// One row per (user, reward), ever - a reward can be claimed at most once
// per learner (decided: no FEATURE_MAP row shows a repeat-purchase flow, and
// PR-22's READY/USED state framing matches a one-time claim, not a
// restockable purchase - matches the "once, idempotent" pattern this
// codebase uses everywhere else, e.g. certificates). `pricePaid` is a
// snapshot of `rewards.priceVm` at claim time (src/server/rewards/
// service.ts) - a later admin price change never affects what an already-
// claimed row shows or how much a refund (src/server/rewards/service.ts's
// refundRewardClaim) pays back.
export const rewardClaims = pgTable(
  "reward_claims",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => rewards.id, { onDelete: "restrict" }),
    pricePaid: integer("price_paid").notNull(),
  },
  (t) => [uniqueIndex("reward_claims_user_reward_idx").on(t.userId, t.rewardId)],
).enableRLS();
