import { inngest } from "@/lib/inngest";
import { runAccountDeletionReconciliationSweep } from "@/server/users/service";

// Safety net for account-deletion-process (the event-triggered path
// deleteMe() fires): catches anything still not fully deleted after that
// job's own retries are exhausted, or if the event itself was never even
// sent/received (e.g. a crash between writing the marker and sending it).
// Same off-peak IST slot family as the other daily jobs, between
// notifications-retention (3:15) and revenuecat-entitlement-reconciliation
// (3:45).
export const accountDeletionReconciliationJob = inngest.createFunction(
  { id: "account-deletion-reconciliation", triggers: [{ cron: "TZ=Asia/Kolkata 50 3 * * *" }] },
  async ({ step }) => step.run("sweep", () => runAccountDeletionReconciliationSweep()),
);
