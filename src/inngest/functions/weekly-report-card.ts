import { logInternalError } from "@/lib/http";
import { inngest } from "@/lib/inngest";
import { sendWeeklyReportParentEmail } from "@/server/report-card/parent-email";
import { listActiveUsersForReportCard } from "@/server/report-card/repo";
import { computeAndStoreWeeklySnapshot, getEligibleParentContactForWeeklyReport } from "@/server/report-card/service";

// PRODUCT_SPEC.md §6: "computed by a weekly Inngest job (Monday, IST)".
// Fans out per-user inside step.run() calls so a single user's failure
// (a bad snapshot computation, a parent-email send hiccup) never aborts the
// whole run or blocks every other learner's snapshot - matches the
// "isolated, best-effort" reasoning already used for the certificate/badge
// hooks elsewhere in this phase. computeAndStoreWeeklySnapshot's own
// (userId, weekStartDate) idempotency means a retried step never recomputes
// or double-writes.
export const weeklyReportCardJob = inngest.createFunction(
  { id: "weekly-report-card", triggers: [{ cron: "TZ=Asia/Kolkata 0 0 * * 1" }] },
  async ({ step }) => {
    const users = await step.run("list-users", () => listActiveUsersForReportCard());

    for (const user of users) {
      await step.run(`process-user-${user.id}`, async () => {
        try {
          const snapshot = await computeAndStoreWeeklySnapshot(user.id);
          const parentContact = await getEligibleParentContactForWeeklyReport(user);
          if (parentContact) {
            await sendWeeklyReportParentEmail(user, parentContact.email, snapshot);
          }
        } catch (err) {
          logInternalError("report_card.weekly_job_user_failed", err);
        }
      });
    }

    return { processed: users.length };
  },
);
