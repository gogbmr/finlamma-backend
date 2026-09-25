import { inngest } from "@/lib/inngest";
import { notifyAffectedMinorsForReapproval } from "@/server/onboarding/service";

// ROADMAP.md Phase 7 item, pulled forward into Phase 3b: the synchronous
// inline send on publish (src/app/admin/(dashboard)/legal/actions.ts) didn't
// scale for a large affected-minors batch. Publishing now just sends this
// event; the actual notify loop (already per-candidate isolated - see
// notifyAffectedMinorsForReapproval's try/catch) runs here instead, off the
// admin's request/response cycle. No requestMeta from an event trigger (same
// "no ip/userAgent for a system-driven action" shape as the Clerk webhook
// handlers) - every notified minor still gets a real activity_logs entry via
// notifyAffectedMinorsForReapproval itself.
export const legalReapprovalEmailsJob = inngest.createFunction(
  { id: "legal-reapproval-emails", triggers: [{ event: "legal/document.published_requiring_reapproval" }] },
  async ({ event, step }) => {
    const { legalDocumentId } = event.data as { legalDocumentId: string };
    return step.run("notify-affected-minors", () =>
      notifyAffectedMinorsForReapproval(legalDocumentId, { ip: null, userAgent: null }),
    );
  },
);
