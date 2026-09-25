import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { users } from "./users";

// The economy's activity taxonomy (docs/ECONOMY.md) - deliberately its own
// enum, not lessons.kind, because the names differ ("ai_chat" here is the
// "doubt_zone" lesson kind - see src/server/economy/service.ts's
// activityKindForLessonKind) and because non-lesson activities (pulse_check,
// cheers, streak bonuses, ...) will be added here in later phases without
// touching lessons.kind at all.
export const rewardActivityKindEnum = pgEnum("reward_activity_kind", [
  "video",
  "story",
  "ai_chat",
  "role_play",
  "quiz",
  "boss_quiz",
]);

// Admin-editable default XP/VM per activity kind (docs/ECONOMY.md's seeded
// 3x values). One row per kind - staff edit the row in place, they don't
// create new versions - so `activityKind` is unique. XP and V Money are
// earned independently (docs/PRODUCT_SPEC.md §2): there is no conversion
// rate between the two columns, they're just the two amounts this activity
// pays out.
export const rewardRules = pgTable("reward_rules", {
  ...idAndTimestamps(),
  activityKind: rewardActivityKindEnum("activity_kind").notNull().unique(),
  defaultXp: integer("default_xp").notNull(),
  defaultVm: integer("default_vm").notNull(),
  active: boolean("active").default(true).notNull(),
}).enableRLS();

// Append-only, like activity_logs - no update/delete path exists anywhere in
// the codebase for this table (docs/DATA_MODEL.md, the money-ledger skill).
// `amount` can be negative for a reversal row, but the original credited row
// is never touched - see the money-ledger skill for the full reversal shape.
// The unique index on (userId, sourceType, sourceId) is the actual
// idempotency mechanism: crediting code always attempts the insert and
// treats a conflict as "already credited, do nothing"
// (src/server/economy/repo.ts's creditXp/creditVMoney use
// onConflictDoNothing), which is what makes "credit once per user per
// lesson, on the first successful completion" correct without needing to
// separately track "has this already been credited" - see docs/ECONOMY.md.
export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    // Null for a non-rule-based entry (a reversal, or a future manual admin
    // adjustment) - never null for a normal activity credit.
    ruleId: uuid("rule_id").references(() => rewardRules.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
  },
  (t) => [
    uniqueIndex("xp_events_user_source_idx").on(t.userId, t.sourceType, t.sourceId),
    index("xp_events_user_id_idx").on(t.userId),
  ],
).enableRLS();

// Same append-only/idempotency shape as xp_events (see above) - the only
// difference is `amount` is a `bigint({ mode: "number" })`, per CLAUDE.md
// rule 2 ("V Money and prices are integers... never use floats for money"),
// and `multiplierApplied` records the `settings_kv.vm_issuance_multiplier`
// value in effect when THIS row was written, so a balance stays explainable
// even after the multiplier is later changed in the Ops console
// (docs/PRODUCT_SPEC.md §2). Null (like ruleId) for a non-rule-based entry.
// Phase 4 (docs/ARCHITECTURE.md D37): the ledger's unit moved from whole V
// Money to PAISE - `amountPaise` is the source of truth from Checkpoint 5
// onward, kept alongside the original `amount` column (whole VM) rather than
// renaming it in place, per the db-migration skill's "add-new -> backfill ->
// switch reads -> drop-old later" rule: `main`'s pre-Phase-4 code keeps
// writing only `amount` until this phase's code (which writes/reads only
// `amountPaise`) is actually deployed there, since preview and production
// share one database (CLAUDE.md rule 8). `amount` is dropped in a follow-up
// destructive migration once that's confirmed - see D37 for the exact SQL
// and reasoning, including why paise (not whole-VM-with-rounding) is
// required for trading to be exact. Every admin-authored "how many VM" value
// (reward_rules.defaultVm, rewards.priceVm, badges.vmReward, ...) is
// UNCHANGED, still whole VM - only this ledger column's unit changed, and
// only at the handful of call sites that turn a whole-VM figure into a
// ledger row (see src/server/economy/schemas.ts's VM_TO_LEDGER_PAISE).
export const vmoneyLedger = pgTable(
  "vmoney_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Deprecated (D37) - superseded by amountPaise. Relaxed from NOT NULL to
    // nullable here (not dropped yet) precisely so this phase's code, which
    // never writes it, can insert rows once deployed - old, still-running
    // code on `main` keeps writing it as before, unaffected either way, and
    // it's kept only until the follow-up destructive migration drops it.
    amount: bigint("amount", { mode: "number" }),
    amountPaise: bigint("amount_paise", { mode: "number" }),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    ruleId: uuid("rule_id").references(() => rewardRules.id, { onDelete: "restrict" }),
    multiplierApplied: doublePrecision("multiplier_applied"),
    reason: text("reason").notNull(),
  },
  (t) => [
    uniqueIndex("vmoney_ledger_user_source_idx").on(t.userId, t.sourceType, t.sourceId),
    index("vmoney_ledger_user_id_idx").on(t.userId),
  ],
).enableRLS();
