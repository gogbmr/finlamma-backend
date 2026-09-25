import { date, integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { users } from "./users";

// One row per (user, IST calendar day) - written from client-reported
// session-end pings (FEATURE_MAP World Home gap #5: "a lightweight
// session_time_daily, written from client-reported session-end pings"),
// never a heartbeat. Low-stakes and not reward-bearing (no XP/VM is ever
// derived from this table - see docs/PRODUCT_SPEC.md §2's daily-goal-meter
// note), so a client-reported value is an acceptable trust level here,
// unlike anywhere real money/XP is on the line (D21) - the service layer
// still caps a single ping's seconds to something sane
// (src/server/session-time/service.ts) as a basic sanity bound, not an
// anti-cheat measure.
export const sessionTimeDaily = pgTable(
  "session_time_daily",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dateIst: date("date_ist").notNull(),
    seconds: integer("seconds").default(0).notNull(),
  },
  (t) => [uniqueIndex("session_time_daily_user_date_idx").on(t.userId, t.dateIst)],
).enableRLS();
