import {
  bigint,
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";

// Phase 4 (docs/ROADMAP.md) - 12 NSE large caps, admin-editable (PRODUCT_SPEC.md
// §4). `about`/`tip` are admin-curated static text (docs/FEATURE_MAP.md Gaps ->
// Trade #5/#8) - never pulled live from a data provider, and `tip` must stay
// purely educational (what the company does / a finance concept it
// illustrates), never phrased as a buy/sell signal - CLAUDE.md's "never
// investment advice" line. `mcap`/`pe` are the same: admin-curated display
// stats, not live-fetched - live OHLC/volume/LTP come from Twelve Data at
// request time (Checkpoint 2), never stored here. `mcap` is a rough display
// figure in whole rupees (not paise - market cap doesn't need paisa
// precision and isn't used in any transactional arithmetic); `pe` is a
// dimensionless ratio, so doublePrecision, same reasoning as
// vmoney_ledger.multiplierApplied being a non-money ratio.
export const instruments = pgTable("instruments", {
  ...idAndTimestamps(),
  symbol: text("symbol").notNull().unique(),
  exchange: text("exchange").notNull().default("NSE"),
  name: text("name").notNull(),
  sector: text("sector").notNull(),
  about: jsonb("about").$type<LocalizedText>().notNull(),
  tip: jsonb("tip").$type<LocalizedText>().notNull(),
  tags: text("tags").array().notNull().default([]),
  mcap: bigint("mcap", { mode: "number" }),
  pe: doublePrecision("pe"),
  lotSize: integer("lot_size").notNull().default(1),
  active: boolean("active").default(true).notNull(),
  halted: boolean("halted").default(false).notNull(),
}).enableRLS();

// NSE trading holidays (docs/DATA_MODEL.md) - admin-editable, drives the
// market-hours check in src/server/market (Checkpoint 3). One row per
// calendar date; `name` is just a display label ("Diwali Laxmi Pujan", ...).
export const marketHolidays = pgTable(
  "market_holidays",
  {
    ...idAndTimestamps(),
    date: date("date", { mode: "string" }).notNull(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("market_holidays_date_idx").on(t.date)],
).enableRLS();

export const feedModeEnum = pgEnum("feed_mode", ["live", "delayed_15m", "paused"]);

// A single global row (Ops console, docs/PRODUCT_SPEC.md's Ops console
// section) - `id` is always the fixed singleton value below, never a second
// row. Modeled as its own table rather than settings_kv because the Ops
// console reads/writes it as one structured record, not a generic key/value
// blob, and TR-46/TR-48 (docs/FEATURE_MAP.md) treat it as first-class admin
// state with its own audit trail. No per-symbol halt here - that's
// `instruments.halted` (TR-49).
export const MARKET_CONTROLS_SINGLETON_ID = "singleton";

export const marketControls = pgTable("market_controls", {
  id: text("id").primaryKey().default(MARKET_CONTROLS_SINGLETON_ID),
  feedMode: feedModeEnum("feed_mode").notNull().default("live"),
  globalHalt: boolean("global_halt").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}).enableRLS();
