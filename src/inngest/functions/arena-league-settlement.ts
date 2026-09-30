import { inngest } from "@/lib/inngest";
import { settleArenaLeaguesForWeek } from "@/server/arena/service";

// Phase 6 Checkpoint 3 (docs/ARCHITECTURE.md D55/D56). Runs once, Monday
// 00:30 IST - after the daily world-XP rollup's 00:10 slot and the weekly
// report card's 00:00 slot, so nothing collides - settling the week that
// just ended. Idempotent at the DB level (league_settlements' own unique
// index on (userId, weekStartDate), checked inside settleArenaLeaguesForWeek
// before any VM/badge credit is attempted) - a retried or duplicate run for
// the same week is a cheap no-op per learner, never a double payment. A
// single scope's or learner's failure isn't isolated with its own step.run
// the way weeklyReportCardJob fans out (this job's phases are inherently
// sequential - the per-user "best zone" pass needs every scope's zones
// already computed) - a thrown error fails the whole run and Inngest
// retries it from the top, which is safe precisely because every write
// inside it is itself idempotent.
export const arenaLeagueSettlementJob = inngest.createFunction(
  { id: "arena-league-settlement", triggers: [{ cron: "TZ=Asia/Kolkata 30 0 * * 1" }] },
  async ({ step }) => {
    return step.run("settle", () => settleArenaLeaguesForWeek());
  },
);
