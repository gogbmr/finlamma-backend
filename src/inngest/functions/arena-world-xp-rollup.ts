import { istDateString } from "@/lib/ist-date";
import { inngest } from "@/lib/inngest";
import { upsertWorldXpSnapshotsForDate } from "@/server/arena/repo";

// Phase 6 (FEATURE_MAP AR-04): backs the Worlds leaderboard's 7-day XP
// sparkline. Runs once, shortly after IST midnight, snapshotting the day
// that just ended - not "today so far" (which would be almost entirely
// zero at that hour). Idempotent (upsertWorldXpSnapshotsForDate's
// onConflictDoUpdate on (worldId, dateIst)) - a retried run for the same
// date just recomputes and overwrites the same numbers, never double-counts,
// since this reads xp_events rather than incrementing a counter.
export const arenaWorldXpRollupJob = inngest.createFunction(
  { id: "arena-world-xp-rollup", triggers: [{ cron: "TZ=Asia/Kolkata 10 0 * * *" }] },
  async ({ step }) => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateIst = istDateString(yesterday);
    const worldsUpdated = await step.run("upsert-snapshots", () => upsertWorldXpSnapshotsForDate(dateIst));
    return { dateIst, worldsUpdated };
  },
);
