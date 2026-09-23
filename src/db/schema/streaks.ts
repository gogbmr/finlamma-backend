import { date, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { users } from "./users";

// Two independent habit loops, same shape (docs/DATA_MODEL.md) - "learning"
// is built in Phase 3 Checkpoint 4; "pulse_check" is a real, distinct row
// per user from day one, but nothing writes to it until Phase 5's Pulse
// Check exists to trigger it. A user with no pulse_check activity yet simply
// has no row (see src/server/streaks/service.ts's shapeStreak, which
// defaults an absent row to 0/0/full freezes rather than requiring one to
// exist).
export const streakScopeEnum = pgEnum("streak_scope", ["learning", "pulse_check"]);

// last_active_date_ist is a plain `date` (mode: "string", 'YYYY-MM-DD') -
// deliberately not a timestamp. It's already an IST calendar date computed
// server-side (src/lib/ist-date.ts) before it ever reaches this column, so
// storing it as a bare date string sidesteps any further timezone
// reinterpretation by the driver or Postgres itself. freezes_left/
// freezes_reset_month implement the monthly freeze allowance (default 2,
// settings_kv "streaks".streakFreezesPerMonth) with a lazy reset: the first
// activity recorded in a new IST month resets freezes_left to the current
// admin-configured allowance and stamps freezes_reset_month, rather than a
// scheduled job doing it for every user at month start - see
// docs/ARCHITECTURE.md D30.
export const streaks = pgTable(
  "streaks",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: streakScopeEnum("scope").notNull(),
    current: integer("current").notNull().default(0),
    longest: integer("longest").notNull().default(0),
    lastActiveDateIst: date("last_active_date_ist", { mode: "string" }).notNull(),
    freezesLeft: integer("freezes_left").notNull(),
    freezesResetMonth: text("freezes_reset_month").notNull(),
  },
  (t) => [uniqueIndex("streaks_user_scope_idx").on(t.userId, t.scope)],
).enableRLS();
