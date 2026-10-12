import { boolean, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { idAndTimestamps, type LocalizedText } from "./_helpers";

// D73 (docs/ARCHITECTURE.md): the staff-curated, non-learner-authored
// catalog every peer-visible identity (Arena, leaderboards, competitions,
// the activity feed) is drawn from, replacing firstName+lastInitial - same
// "admin-curated preset, never free text" pattern as about_me_chips (D36),
// applied to the identity itself rather than just the bio. `key` is a
// stable slug (e.g. "smart-saver"), unique, used by the seed script to stay
// idempotent on a re-run and as a human-readable reference in the admin
// editor - never shown to anyone, never read by application logic besides
// seeding. Deliberately its own file, not inside arena.ts: users.ts needs
// to reference this table for `handleId`, and arena.ts already imports
// `users` - defining this table inside arena.ts would make that a circular
// module import.
export const peerHandles = pgTable(
  "peer_handles",
  {
    ...idAndTimestamps(),
    key: text("key").notNull().unique(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    active: boolean("active").default(true).notNull(),
  },
  (t) => [index("peer_handles_active_idx").on(t.active)],
).enableRLS();
