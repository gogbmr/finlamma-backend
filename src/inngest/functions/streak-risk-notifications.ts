import { inngest } from "@/lib/inngest";
import { notifyLearnersWithStreakAtRisk } from "@/server/streaks/service";

// Once daily, 8pm IST - late enough that "at risk" is real (most of the
// day's natural activity has already happened), early enough that a
// learner still has a real window to act before the IST day rolls over.
export const streakRiskNotificationsJob = inngest.createFunction(
  { id: "streak-risk-notifications", triggers: [{ cron: "TZ=Asia/Kolkata 0 20 * * *" }] },
  async ({ step }) => {
    return step.run("notify", () => notifyLearnersWithStreakAtRisk());
  },
);
