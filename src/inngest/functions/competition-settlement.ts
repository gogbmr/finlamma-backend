import { inngest } from "@/lib/inngest";
import { settleDueCompetitions } from "@/server/competitions/service";

// Phase 6 Checkpoint 7. Runs daily (competitions aren't all calendar-month-
// aligned - windowStart/windowEnd are admin-set per competition - so a
// fixed cron date doesn't fit the way it does for Arena's weekly settlement;
// a daily sweep finds whatever just closed, whenever that was). Idempotent
// at two levels (docs/ARCHITECTURE.md D57's schema comment): the OUTER gate
// (`competitions.settledAt`, claimed atomically) means a competition is
// never swept twice; the INNER gate (`competition_prizes`' own unique
// index) means no single entrant is ever paid twice even under a race.
// Each competition settles independently inside settleDueCompetitions - one
// competition failing (e.g. no price data available at all when this runs)
// never blocks another, and simply retries on tomorrow's sweep.
export const competitionSettlementJob = inngest.createFunction(
  { id: "competition-settlement", triggers: [{ cron: "TZ=Asia/Kolkata 45 0 * * *" }] },
  async ({ step }) => {
    return step.run("settle-due-competitions", () => settleDueCompetitions());
  },
);
