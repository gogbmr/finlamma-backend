import {
  bigint,
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
import { users } from "./users";

export const fundCategoryEnum = pgEnum("fund_category", ["index", "equity", "hybrid", "debt", "elss"]);
export const fundRiskEnum = pgEnum("fund_risk", ["very_low", "low", "moderate", "high", "very_high"]);

// Phase 4 Checkpoint 8 (docs/ARCHITECTURE.md D45). Every fund shown to a
// learner is a FICTIONAL Finlamma-branded wrapper, never a real AMC's fund
// name - `amfiSchemeCode` is the only link to reality (which real scheme's
// NAV this wrapper tracks, for realistic movement) and is an internal-only
// admin field: no API response the app or a learner ever sees includes it
// (every repo query below selects an explicit column list that omits it).
// `expenseRatioBps`/`description` are illustrative/category-typical, not a
// claim about the real scheme's own actual figures - see D45. No star
// rating (a third-party opinion this app would be inventing) and no AUM (an
// identifying scale claim about a real, specific company with no honest way
// to attach it to a fictional wrapper) - both dropped per the founder's
// review. `description` goes through the same advice-language heuristic as
// instruments.about/tip (src/server/trading/advice-language.ts).
export const funds = pgTable("funds", {
  ...idAndTimestamps(),
  name: text("name").notNull(),
  category: fundCategoryEnum("category").notNull(),
  risk: fundRiskEnum("risk").notNull(),
  description: jsonb("description").$type<LocalizedText>().notNull(),
  amfiSchemeCode: text("amfi_scheme_code").notNull().unique(),
  expenseRatioBps: integer("expense_ratio_bps").notNull(),
  minLumpSumPaise: bigint("min_lump_sum_paise", { mode: "number" }).notNull(),
  minSipPaise: bigint("min_sip_paise", { mode: "number" }).notNull(),
  active: boolean("active").default(true).notNull(),
}).enableRLS();

// Append-only historical NAV series, one row per (fund, calendar date) -
// never overwritten once written (D45). `navPaise` is the real AMFI NAV
// rounded to the nearest paise (CLAUDE.md rule 2: money is integer paise,
// no exception for NAV) - see D45 for why this occasionally makes an
// immediate buy-then-redeem at "the same NAV" net a fraction of a paise off
// zero, unlike a stock round trip which is always exact.
export const fundNavs = pgTable(
  "fund_navs",
  {
    ...idAndTimestamps(),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    navPaise: bigint("nav_paise", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("fund_navs_fund_date_idx").on(t.fundId, t.date),
    index("fund_navs_fund_id_idx").on(t.fundId),
  ],
).enableRLS();

export const fundOrderSideEnum = pgEnum("fund_order_side", ["buy", "sell"]);
// No "open"/"cancelled" state (unlike stock orders) - a fund order either
// executes immediately against the latest NAV or doesn't; there is no
// LIMIT-order concept for a once-a-day NAV. "failed" is ONLY ever written
// for a SIP-triggered attempt (D45/D46) - a manual buy/sell that can't
// complete throws an AppError with zero DB write, same convention as stock
// orders (D41), since a manual attempt gets immediate UI feedback and
// doesn't need a persisted trail the way an unattended SIP does.
export const fundOrderStatusEnum = pgEnum("fund_order_status", ["filled", "failed"]);

export const sipStatusEnum = pgEnum("sip_status", ["active", "paused", "cancelled"]);

// One row per (user, fund) SIP mandate. `dayOfMonth` is restricted to 1-28
// at the schema/Zod level (never 29-31) specifically to sidestep "SIP due
// Feb 30" - every calendar month has a 28th, so this needs no month-length
// special-casing anywhere else in the codebase.
export const sipPlans = pgTable(
  "sip_plans",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "restrict" }),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    dayOfMonth: integer("day_of_month").notNull(),
    status: sipStatusEnum("status").notNull().default("active"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [index("sip_plans_user_id_idx").on(t.userId), index("sip_plans_status_idx").on(t.status)],
).enableRLS();

// Every fund BUY/SELL, manual or SIP-triggered. `sipPlanId`/`dueDate` are
// only set for a SIP-triggered attempt; the unique index on them is the
// idempotency mechanism a retried SIP-execution run relies on (D46) - same
// insert-and-treat-conflict-as-already-handled shape as every other
// money-moving write in this codebase (D26/D37/D41). Postgres treats
// multiple (NULL, NULL) rows (every manual order) as distinct, never
// colliding with each other, so no partial index is needed. `navPaise`/
// `navDate` are always the exact NAV this fill used - shown back to the
// learner on every response, no hidden pricing (founder's Checkpoint 8
// requirement).
export const fundOrders = pgTable(
  "fund_orders",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "restrict" }),
    side: fundOrderSideEnum("side").notNull(),
    status: fundOrderStatusEnum("status").notNull().default("filled"),
    amountPaise: bigint("amount_paise", { mode: "number" }),
    unitsMilli: bigint("units_milli", { mode: "number" }),
    navPaise: bigint("nav_paise", { mode: "number" }),
    navDate: date("nav_date", { mode: "string" }),
    realizedPnlPaise: bigint("realized_pnl_paise", { mode: "number" }),
    idempotencyKey: text("idempotency_key"),
    sipPlanId: uuid("sip_plan_id").references(() => sipPlans.id, { onDelete: "set null" }),
    dueDate: date("due_date", { mode: "string" }),
    failureReason: text("failure_reason"),
  },
  (t) => [
    uniqueIndex("fund_orders_user_idempotency_idx").on(t.userId, t.idempotencyKey),
    uniqueIndex("fund_orders_sip_due_idx").on(t.sipPlanId, t.dueDate),
    index("fund_orders_user_id_idx").on(t.userId),
  ],
).enableRLS();

// One row per (user, fund) - same weighted-average-cost shape as
// src/db/schema/orders.ts's `holdings`, but `unitsMilli` (units x 1000,
// matching real AMCs' 3-decimal-place unit rounding) instead of a whole-
// share qty, since fund units are inherently fractional (D45).
export const fundHoldings = pgTable(
  "fund_holdings",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "restrict" }),
    unitsMilli: bigint("units_milli", { mode: "number" }).notNull().default(0),
    avgNavPaise: bigint("avg_nav_paise", { mode: "number" }).notNull().default(0),
  },
  (t) => [uniqueIndex("fund_holdings_user_fund_idx").on(t.userId, t.fundId)],
).enableRLS();
