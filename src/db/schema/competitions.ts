import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { badges } from "./badges";
import { staffMembers } from "./staff";
import { instruments } from "./trading";
import { orderSideEnum } from "./orders";
import { users } from "./users";

export const competitionStatusEnum = pgEnum("competition_status", ["draft", "published"]);

// Phase 6 Checkpoint 7 (FEATURE_MAP AR-14..18, docs/ARCHITECTURE.md D57/D58/
// D59). `virtual_capital_paise` (renamed from an original, misleading
// `virtual_capital_vm` before any code existed - D57) is NOT V Money: it
// exists only to seed `competition_entries.cash_paise`, and nothing in this
// domain ever writes a vmoney_ledger row except the prize at settlement
// (`competition_prizes`, below). `prizes`/`rules` are admin-authored jsonb,
// same "content the founder writes, code just renders" shape as
// mentors/worlds - `prizes` is an array of {rankFrom, rankTo, vmAmount,
// badgeId} bands (D58's reduced defaults: 5000/2000/500 VM), `rules` is a
// single trilingual text blob for the rules panel (AR-18's "static rules
// text, admin-editable per competition"). `settledAt` is the OUTER
// idempotency gate for the whole competition (claimed atomically via
// `UPDATE ... WHERE settled_at IS NULL RETURNING *`, same lock-then-check
// idiom D30/D49 already establish) - `competition_prizes`' own per-entrant
// unique index is the INNER gate, so a competition can never be swept twice
// and no single entrant can ever be paid twice, even under a race.
export const competitions = pgTable(
  "competitions",
  {
    ...idAndTimestamps(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    virtualCapitalPaise: bigint("virtual_capital_paise", { mode: "number" }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    prizes: jsonb("prizes")
      .$type<Array<{ rankFrom: number; rankTo: number; vmAmount: number; badgeId: string | null }>>()
      .notNull(),
    rules: jsonb("rules").$type<LocalizedText>().notNull(),
    status: competitionStatusEnum("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffMembers.id, { onDelete: "set null" }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("competitions_status_idx").on(t.status), index("competitions_window_end_idx").on(t.windowEnd)],
).enableRLS();

// One row per (competition, user) - `cashPaise`/`qtyHeld`/`avgPricePaise`
// are this entry's ENTIRE isolated position, updated in the same
// transaction as each `competition_trades` fill (identical weighted-average
// shape to `holdings`, D41/D43) - never touching the real `holdings` table
// or `vmoney_ledger` at all (D57). `enteredAt` is what D59's entry-window
// cutoff (`settings_kv.competition_entry_window_pct`) is checked against at
// entry time, not re-validated later.
export const competitionEntries = pgTable(
  "competition_entries",
  {
    ...idAndTimestamps(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enteredAt: timestamp("entered_at", { withTimezone: true }).defaultNow().notNull(),
    cashPaise: bigint("cash_paise", { mode: "number" }).notNull(),
    qtyHeld: integer("qty_held").notNull().default(0),
    avgPricePaise: bigint("avg_price_paise", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    uniqueIndex("competition_entries_competition_user_idx").on(t.competitionId, t.userId),
    index("competition_entries_user_id_idx").on(t.userId),
  ],
).enableRLS();

// Append-only fill log for one entry - mirrors `orders`' shape (D41) but
// against the entry's own isolated cash/position, never the real
// `vmoney_ledger`/`holdings`. MARKET-only (no `type`/`limitPricePaise`
// columns at all) - AR-18's rules never describe a LIMIT-order concept for
// the competition, and single-stock/whole-share-only market fills are all
// the prototype ever specifies. `idempotencyKey` is scoped to the entry
// (not the user directly) since the entry IS the user's one relationship to
// this competition - same (owner, key) uniqueness shape as `orders`'
// (userId, idempotencyKey).
export const competitionTrades = pgTable(
  "competition_trades",
  {
    ...idAndTimestamps(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => competitionEntries.id, { onDelete: "cascade" }),
    side: orderSideEnum("side").notNull(),
    qty: integer("qty").notNull(),
    fillPricePaise: bigint("fill_price_paise", { mode: "number" }).notNull(),
    // SELL fills only (D43-style) - qty * (fillPricePaise - avgPricePaise
    // immediately before this sale).
    realizedPnlPaise: bigint("realized_pnl_paise", { mode: "number" }),
    idempotencyKey: text("idempotency_key").notNull(),
    filledAt: timestamp("filled_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("competition_trades_entry_idempotency_idx").on(t.entryId, t.idempotencyKey),
    index("competition_trades_entry_id_idx").on(t.entryId),
  ],
).enableRLS();

// The idempotency + audit record for the whole prize payout - one row per
// (competition, user), same D26/D55 insert-and-treat-conflict-as-done shape
// every other money-moving settlement in this codebase uses.
// `endingValuePaise` (cashPaise + qtyHeld*finalPricePaise at settlement) is
// the exact source of truth; `roiPctBasisPoints` (ROI% x 100, e.g. 823 =
// 8.23%) is a rounded value stored purely for cheap display/history, never
// re-derived from anything else. `vmAwarded` is the actual amount credited
// (from the matching `competitions.prizes` band) - `badgeId` null for a
// rank with no badge attached (D58: only 1st and 4th-10th carry one).
export const competitionPrizes = pgTable(
  "competition_prizes",
  {
    ...idAndTimestamps(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    endingValuePaise: bigint("ending_value_paise", { mode: "number" }).notNull(),
    roiPctBasisPoints: integer("roi_pct_basis_points").notNull(),
    vmAwarded: integer("vm_awarded").notNull(),
    badgeId: uuid("badge_id").references(() => badges.id, { onDelete: "restrict" }),
  },
  (t) => [uniqueIndex("competition_prizes_competition_user_idx").on(t.competitionId, t.userId)],
).enableRLS();
