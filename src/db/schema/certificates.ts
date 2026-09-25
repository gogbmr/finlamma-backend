import { integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idAndTimestamps } from "./_helpers";
import { users } from "./users";
import { worlds } from "./worlds";

// One row per (user, world), issued the moment that world's Boss Quiz is
// first passed - the exact same signal src/server/quiz-attempts/repo.ts's
// getWorldIdsWithPassedBossQuiz already reads for world unlock (D24), so
// "world complete" means one thing everywhere in this codebase. The unique
// index on (userId, worldId) is the idempotency mechanism (same "insert,
// treat a conflict as already-issued" pattern as xp_events/vmoney_ledger,
// D26) - a retried/duplicate boss-quiz-pass submit never issues a second
// certificate. `code` is the full formatted id
// (FL-<world code>-<year>-<6-digit seq>, per docs/FEATURE_MAP.md's Profile
// gap #8), generated once at issuance and never changed. `xpEarned`/
// `accuracyPct` are a point-in-time snapshot (this learner's total XP and
// this passing attempt's accuracy at the moment of issuance) - deliberately
// never recomputed later, so a certificate's printed numbers stay exactly
// what was true the day it was earned, even if later XP/level-curve changes
// would produce a different number today. `fileKey` is null until the PDF
// is first requested (src/server/certificates/service.ts renders and
// uploads it lazily via src/lib/s3.ts, on first GET .../pdf) - issuance
// itself stays cheap since it happens inline inside the already-busy
// lesson-answer request.
export const certificates = pgTable(
  "certificates",
  {
    ...idAndTimestamps(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "restrict" }),
    code: text("code").notNull().unique(),
    xpEarned: integer("xp_earned").notNull(),
    accuracyPct: integer("accuracy_pct").notNull(),
    fileKey: text("file_key"),
  },
  (t) => [uniqueIndex("certificates_user_world_idx").on(t.userId, t.worldId)],
).enableRLS();
