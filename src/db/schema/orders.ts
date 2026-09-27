import { bigint, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { instruments } from "./trading";
import { users } from "./users";

export const orderSideEnum = pgEnum("order_side", ["buy", "sell"]);
export const orderTypeEnum = pgEnum("order_type", ["market", "limit"]);
// No "rejected" status (docs/ARCHITECTURE.md D41) - a rejection (halt,
// closed, stale/unavailable price, insufficient margin/holdings) is a
// thrown AppError with no DB write, same pattern every other pre-condition
// failure in this codebase already uses (e.g. reward claims never persist
// a "rejected claim" row). "open" is a LIMIT order waiting to fill
// (Checkpoint 6's matching job, or the end-of-day cancel job);
// "cancelled" is set by that same EOD job or a future explicit cancel.
export const orderStatusEnum = pgEnum("order_status", ["open", "filled", "cancelled"]);

// Phase 4 Checkpoint 5 (docs/ARCHITECTURE.md D41, trading-rules skill).
// `idempotencyKey` is required on every order placement (CLAUDE.md rule 3)
// and is what makes a retried request safe - the unique index below is the
// actual idempotency mechanism (same "insert and treat a conflict as
// already-handled" pattern as vmoney_ledger's (userId, sourceType,
// sourceId), D26), not an application-level "have I seen this key" check.
// `limitPricePaise`/`fillPricePaise` are both nullable because they mean
// different things depending on `type`/`status`: a market order never has
// a limitPricePaise; an order that's still "open" never has a
// fillPricePaise yet.
export const orders = pgTable(
  "orders",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    side: orderSideEnum("side").notNull(),
    type: orderTypeEnum("type").notNull(),
    qty: integer("qty").notNull(),
    limitPricePaise: bigint("limit_price_paise", { mode: "number" }),
    status: orderStatusEnum("status").notNull().default("open"),
    fillPricePaise: bigint("fill_price_paise", { mode: "number" }),
    // Only ever set on a SELL fill (Checkpoint 7, docs/ARCHITECTURE.md D43):
    // qty * (fillPricePaise - the holding's avgPricePaise immediately before
    // this sale). Computed and stored once, at fill time, rather than
    // reconstructed later - the exact cost basis a sale realized against is
    // only cheaply knowable at that moment (see holdings' weighted-average
    // cost), and this is what powers the Profile Trades tab's per-trade P&L,
    // win rate and best/worst-trade stats without re-deriving anything.
    realizedPnlPaise: bigint("realized_pnl_paise", { mode: "number" }),
    idempotencyKey: text("idempotency_key").notNull(),
    filledAt: timestamp("filled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("orders_user_idempotency_idx").on(t.userId, t.idempotencyKey),
    index("orders_user_id_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
  ],
).enableRLS();

// One row per (user, instrument) - qty/avgPricePaise are always derived by
// the same weighted-average-cost update every fill applies (BUY blends the
// new price into the average, SELL reduces qty without changing the
// average - see src/server/orders/repo.ts's applyFillToHolding), never
// computed by re-summing every past order at read time. A row can sit at
// qty 0 after a full sell-out rather than being deleted - the next BUY's
// weighted-average formula is correct against a 0-qty base either way, and
// keeping the row avoids delete-then-reinsert churn.
export const holdings = pgTable(
  "holdings",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull().default(0),
    avgPricePaise: bigint("avg_price_paise", { mode: "number" }).notNull().default(0),
    // When this position was last (re)opened - set at insert, and reset to
    // "now" whenever a BUY brings qty from 0 back up to positive (Checkpoint
    // 7, D43). Powers "AVG HOLD"/hold-days on the Profile Trades tab.
    // Deliberately NOT reset on every partial buy that merely adds to an
    // already-open position - only a true 0-to-positive re-entry counts as
    // a new "open". Known limitation: a sale's hold-days is computed
    // against this row's CURRENT value, so a historical closed trade's
    // reported hold time becomes wrong only if the position was later fully
    // exited and reopened again since - accepted as a rare edge case rather
    // than building full per-lot cost-basis tracking for it.
    positionOpenedAt: timestamp("position_opened_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("holdings_user_instrument_idx").on(t.userId, t.instrumentId)],
).enableRLS();
