import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { users } from "./users";
import { worlds } from "./worlds";

// A leaderboard scope is a plain text key rather than an enum, since two of
// its four values are parameterized (a specific world, a specific state) and
// Postgres enums can't carry a payload: "global", "india", "state:<STATE>",
// "world:<worldId>". Every reader/writer of this column goes through
// src/server/arena/scope.ts's own encode/decode helpers so the format is
// enforced in exactly one place.
//
// One row per (weekStartDate, scope) - weekStartDate is the Monday-IST start
// of the week this snapshot closes, written once by the weekly settlement
// job (docs/ROADMAP.md Phase 6, AR-23) and never updated afterward, same
// append-only-in-spirit reasoning as report_snapshots. `rankings` is the
// full ordered list for that scope at settlement time - {userId, rank, xp,
// zone, prevRank} per entry - which is what Profile's percentile (PR-01)
// and rank-delta cells (PR-03) read instead of a live aggregate, and what
// AR-09's "weekly move" arrow diffs against. `poolSize` lets a reader (or
// the state-scope privacy floor, docs/ARCHITECTURE.md decision pending)
// judge whether a scope was even meaningful that week without re-parsing
// `rankings`.
export const leaderboardSnapshots = pgTable(
  "leaderboard_snapshots",
  {
    ...idAndTimestamps(),
    weekStartDate: date("week_start_date", { mode: "string" }).notNull(),
    scope: text("scope").notNull(),
    poolSize: integer("pool_size").notNull(),
    rankings: jsonb("rankings").$type<Array<{ userId: string; rank: number; xp: number; zone: string; prevRank: number | null }>>().notNull(),
  },
  (t) => [uniqueIndex("leaderboard_snapshots_week_scope_idx").on(t.weekStartDate, t.scope)],
).enableRLS();

export const leagueZoneEnum = pgEnum("league_zone", ["promote", "safe", "demote"]);

// One persistent row per scope (see the scope-key format above) - a league
// is the pool itself, not a per-week instance, matching PRODUCT_SPEC.md §3's
// "a flat pool per scope, not named tiers." `league_members` is the pool's
// CURRENT membership/zone as of the last weekly settlement (overwritten in
// place, not append-only - the history of what a member's zone WAS lives in
// leaderboard_snapshots.rankings instead, which already records `zone` per
// entry per week).
export const leagues = pgTable(
  "leagues",
  {
    ...idAndTimestamps(),
    scope: text("scope").notNull().unique(),
  },
).enableRLS();

export const leagueMembers = pgTable(
  "league_members",
  {
    ...idAndTimestamps(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    zone: leagueZoneEnum("zone").notNull(),
    rank: integer("rank").notNull(),
  },
  (t) => [
    uniqueIndex("league_members_league_user_idx").on(t.leagueId, t.userId),
    index("league_members_user_id_idx").on(t.userId),
  ],
).enableRLS();

// Daily rollup backing the Worlds leaderboard's 7-day XP sparkline (AR-04).
// Written by a daily Inngest job, one row per (worldId, dateIst) - a plain
// IST calendar date, same bare-`date` pattern as streaks.lastActiveDateIst,
// since it's always computed server-side before it reaches this column.
// `memberCount` is the count of users whose current world (their furthest
// completed lesson's world) was this world on that day - a cheap daily
// snapshot rather than a live count, since the sparkline only ever needs
// yesterday-and-earlier, never "right now."
export const worldXpSnapshots = pgTable(
  "world_xp_snapshots",
  {
    ...idAndTimestamps(),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    dateIst: date("date_ist", { mode: "string" }).notNull(),
    xpTotal: integer("xp_total").notNull(),
    memberCount: integer("member_count").notNull(),
  },
  (t) => [uniqueIndex("world_xp_snapshots_world_date_idx").on(t.worldId, t.dateIst)],
).enableRLS();

// Arena's first learner-to-learner action (AR-12). `cheerDateIst` is a bare
// IST calendar date (same reasoning as streaks/world_xp_snapshots above),
// computed server-side and never re-derived from `createdAt` at query time -
// this is what makes "one cheer per sender-receiver pair per day" a real DB
// constraint rather than an application-level race. sender != receiver is
// enforced in the service layer (src/server/arena/cheers.ts), not a DB CHECK
// constraint - same "business rule lives in the service, not the schema"
// convention sip_plans.dayOfMonth already follows. No message/text field by
// design (docs/ARCHITECTURE.md D36-adjacent reasoning: this app never shows
// one minor's free text to another) - a cheer carries no content besides
// itself.
export const cheers = pgTable(
  "cheers",
  {
    ...idAndTimestamps(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cheerDateIst: date("cheer_date_ist", { mode: "string" }).notNull(),
  },
  (t) => [
    uniqueIndex("cheers_sender_receiver_date_idx").on(t.senderId, t.receiverId, t.cheerDateIst),
    index("cheers_receiver_id_idx").on(t.receiverId),
  ],
).enableRLS();

// The idempotency + audit record for Phase 6 Checkpoint 3's weekly VM/crest
// payout - one row per (userId, weekStartDate), enforced by the DB unique
// index below, never by an app-level "have I already paid this" check (same
// D26 insert-and-treat-conflict-as-done shape every other money-moving write
// in this codebase uses). `scope`/`zone`/`xp` record the SINGLE
// best-qualifying scope this payout was based on (docs/ARCHITECTURE.md D55:
// a learner is paid once, for their best zone across scopes, never summed) -
// distinct from `league_members`, which still holds the learner's CURRENT
// zone in every scope they're in, for display. `vmAwarded` is the actual
// amount credited after the weekly cap clamp (settings_kv), which can be
// less than the zone's nominal reward.
export const leagueSettlements = pgTable(
  "league_settlements",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date", { mode: "string" }).notNull(),
    scope: text("scope").notNull(),
    zone: leagueZoneEnum("zone").notNull(),
    xp: integer("xp").notNull(),
    vmAwarded: integer("vm_awarded").notNull(),
  },
  (t) => [
    uniqueIndex("league_settlements_user_week_idx").on(t.userId, t.weekStartDate),
    index("league_settlements_week_idx").on(t.weekStartDate),
  ],
).enableRLS();

// AR-20's preset "about me" chip catalog (docs/ARCHITECTURE.md D36 - the
// free-text-bio replacement). Admin-managed, same LocalizedText/iconKey
// shape as badges' display fields, minus badges' criteria/vmReward since a
// chip is purely cosmetic self-expression, never something a learner earns
// or that pays out anything. `active` (not a draft/published split) since a
// chip has no authoring workflow to gate - staff either offer it or retire
// it.
export const aboutMeChips = pgTable(
  "about_me_chips",
  {
    ...idAndTimestamps(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    iconKey: text("icon_key"),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [index("about_me_chips_active_idx").on(t.active)],
).enableRLS();

// A learner's current chip selection - same idempotent, one-row-per-pair
// join shape as user_badges. The selection cap (a small number, e.g. 3) is
// enforced in the service layer, not the schema, so an admin can change the
// cap later without a migration.
export const userAboutMeChips = pgTable(
  "user_about_me_chips",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chipId: uuid("chip_id")
      .notNull()
      .references(() => aboutMeChips.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("user_about_me_chips_user_chip_idx").on(t.userId, t.chipId),
    index("user_about_me_chips_user_id_idx").on(t.userId),
  ],
).enableRLS();
