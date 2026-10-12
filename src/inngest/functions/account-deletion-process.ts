import { inngest } from "@/lib/inngest";
import { reconcileAccountDeletion } from "@/server/users/service";

// Fired by DELETE /me (src/server/users/service.ts deleteMe) the instant
// the deletion-requested marker is durably written - this is what actually
// does the work (Clerk delete, DB anonymize, consent scrub, push tokens,
// Doubt Zone content), off the request/response cycle, with Inngest's own
// automatic step-retry/backoff covering a transient failure. The daily
// account-deletion-reconciliation sweep is the safety net for anything
// still stuck after this - see reconcileAccountDeletion's own comment for
// why re-running it from the top is always safe.
export const accountDeletionProcessJob = inngest.createFunction(
  { id: "account-deletion-process", triggers: [{ event: "account/deletion.requested" }] },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };
    return step.run("reconcile", () =>
      reconcileAccountDeletion(userId, { ip: null, userAgent: null }),
    );
  },
);
