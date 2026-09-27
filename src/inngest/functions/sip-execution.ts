import { logInternalError } from "@/lib/http";
import { inngest } from "@/lib/inngest";
import { istDateString } from "@/lib/ist-date";
import { executeSipDueTx, listActiveSipPlansDueOn } from "@/server/fund-orders/repo";

// Phase 4 Checkpoint 8 (docs/ARCHITECTURE.md D46). Runs once daily -
// executeSipDueTx's own (sipPlanId, dueDate) idempotency (a database unique
// constraint) is what makes a retried run of this job, or a retried step
// within it, never double-charge a plan for the same due date. Fans out one
// step.run() per due plan, same "one plan's failure never blocks the
// batch" shape as weeklyReportCardJob/limitOrderMatchingJob - one plan
// hitting an unexpected error never stops another plan's SIP from running
// today.
export const sipExecutionJob = inngest.createFunction(
  { id: "sip-execution", triggers: [{ cron: "TZ=Asia/Kolkata 0 10 * * *" }] },
  async ({ step }) => {
    const todayIst = istDateString();
    const dayOfMonth = Number(todayIst.slice(8, 10));

    const duePlans = await step.run("list-due-plans", () => listActiveSipPlansDueOn(dayOfMonth));

    let filled = 0;
    let failed = 0;
    for (const plan of duePlans) {
      const result = await step.run(`execute-sip-${plan.id}`, async () => {
        try {
          return await executeSipDueTx(plan, todayIst);
        } catch (err) {
          logInternalError("funds.sip_execution_failed", err);
          return { status: "error" as const };
        }
      });
      if (result.status === "filled") filled += 1;
      if (result.status === "failed_recorded") failed += 1;
    }

    return { due: duePlans.length, filled, failed };
  },
);
