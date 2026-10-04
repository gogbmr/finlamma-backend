import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";
import { users } from "./users";

export const pushPlatformEnum = pgEnum("push_platform", ["ios", "android"]);

// One row per (user, device) - a learner can have more than one device
// registered (phone + tablet). expoPushToken is unique on its own (Expo
// issues one token per app install; a reinstall gets a new token) so a
// token that moves to a different account on re-registration is simply
// reassigned here via onConflictDoUpdate, never duplicated.
export const pushTokens = pgTable(
  "push_tokens",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expoPushToken: text("expo_push_token").notNull().unique(),
    platform: pushPlatformEnum("platform").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("push_tokens_user_id_idx").on(t.userId)],
).enableRLS();

// { startHourIst, endHourIst } in 0-23, wrapping past midnight allowed
// (e.g. 21-7). Null means "use settings_kv's global default" - there is
// only ever one level of override (global default vs. this row), so null
// always means "no personal override set", never "explicitly cleared to
// off" (that's the separate `enabled` flag below).
export type NotificationQuietHours = { startHourIst: number; endHourIst: number };

// WH-21's observed trigger types, plus cheer_received (docs/ROADMAP.md:285-286
// - Arena cheers already award +5 XP but skipped the push because this
// table didn't exist yet) and league_rank_change (WH-21's "rank-change
// (Top 8%) celebration", fed by the existing weekly Arena league
// settlement job). Declared above notificationPrefs (not below, where it
// originally lived) so notificationPrefs.disabledCategories can reference
// its element type.
export const notificationKindEnum = pgEnum("notification_kind", [
  "streak_risk",
  "boss_battle",
  "market_news",
  "session_goal",
  "cheer_received",
  "league_rank_change",
]);
export type NotificationKind = (typeof notificationKindEnum.enumValues)[number];

// One row per user. `enabled` is SET-07's single on/off root toggle
// (FEATURE_MAP - v1 has no per-notification-kind granularity in the
// prototype). `disabledCategories` (Phase 7 Checkpoint 6 addition, beyond
// FEATURE_MAP's original scope, per founder request) layers per-kind
// opt-out on top: `enabled` is the master switch, a kind listed here is
// additionally off even while `enabled` is true. Row is created lazily on
// first read/write (service layer), same as other one-row-per-user
// preference tables in this codebase - a missing row means "defaults for
// everything" (enabled, no categories disabled), not "notifications off".
export const notificationPrefs = pgTable("notification_prefs", {
  ...idAndTimestamps(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  enabled: boolean("enabled").default(true).notNull(),
  quietHours: jsonb("quiet_hours").$type<NotificationQuietHours | null>(),
  disabledCategories: jsonb("disabled_categories").$type<NotificationKind[]>().default([]).notNull(),
}).enableRLS();

// WH-20: "notifications auto-expire after 30 days" - enforced by a
// retention Inngest job querying createdAt, not a stored expiry column.
// `data` is a loose, kind-dependent jsonb payload (e.g. {worldId} for
// boss_battle, {newsStoryId} for market_news) so the client can deep-link
// on tap - same "loose jsonb, validated per-kind at the service layer"
// pattern as lessons.content.
export const notifications = pgTable(
  "notifications",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    title: jsonb("title").$type<LocalizedText>().notNull(),
    body: jsonb("body").$type<LocalizedText>().notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("notifications_user_id_created_at_idx").on(t.userId, t.createdAt)],
).enableRLS();
