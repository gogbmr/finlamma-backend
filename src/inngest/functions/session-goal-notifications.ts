import { inngest } from "@/lib/inngest";
import { notifyLearnersWithCompletedDailyGoal } from "@/server/daily-goals/service";

// Every 30 min through the day (IST) - daily goals have no discrete
// "completed" event to trigger on (src/server/daily-goals/service.ts's own
// doc comment), so this periodically re-checks active learners instead.
// hasBeenNotifiedSince inside notifyLearnersWithCompletedDailyGoal means a
// learner who's already been notified today, or hasn't completed a goal
// yet, is cheaply skipped on every re-run.
export const sessionGoalNotificationsJob = inngest.createFunction(
  { id: "session-goal-notifications", triggers: [{ cron: "TZ=Asia/Kolkata */30 8-22 * * *" }] },
  async ({ step }) => {
    return step.run("notify", () => notifyLearnersWithCompletedDailyGoal());
  },
);
