import { inngest } from "@/lib/inngest";
import { reconcileEntitlementsNearExpiry } from "@/server/monetisation/service";

// Phase 8 Checkpoint 4: a RevenueCat webhook can be missed, delayed, or
// malformed - this re-fetches RevenueCat's own canonical entitlement state
// for every row near its expiry, so a missed webhook self-heals within a
// day instead of leaving stale ad-free status indefinitely. Off-peak IST
// hours, same slot family as the other daily jobs.
export const revenuecatEntitlementReconciliationJob = inngest.createFunction(
  { id: "revenuecat-entitlement-reconciliation", triggers: [{ cron: "TZ=Asia/Kolkata 45 3 * * *" }] },
  async ({ step }) => step.run("reconcile", () => reconcileEntitlementsNearExpiry()),
);
