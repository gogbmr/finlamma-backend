import { logInternalError } from "@/lib/http";
import { inngest } from "@/lib/inngest";
import { listOpenLimitOrdersWithInstrument, matchOpenLimitOrderTx } from "@/server/orders/repo";

// Checkpoint 6 (docs/ARCHITECTURE.md D42). Runs every minute, Mon-Fri,
// across (and slightly around) NSE hours - the cron window is deliberately
// wider than 09:15-15:30 IST since cron can't express holidays or the exact
// :15/:30 boundary; matchOpenLimitOrderTx's own isMarketOpen check is the
// real gate; a tick outside real market hours just finds nothing marketable
// and each order returns "market_closed" cheaply.
// Fans out per-order inside its own step.run(), same "one user's failure
// never blocks another's" reasoning as weeklyReportCardJob - a single
// order's DB error (or a stale/missing price for its symbol) never stops
// the rest of the batch from being attempted this tick; it just stays
// "open" and gets retried on the next one.
export const limitOrderMatchingJob = inngest.createFunction(
  { id: "limit-order-matching", triggers: [{ cron: "TZ=Asia/Kolkata * 9-15 * * 1-5" }] },
  async ({ step }) => {
    const candidates = await step.run("list-open-orders", () => listOpenLimitOrdersWithInstrument());

    let filled = 0;
    for (const { order, instrument } of candidates) {
      const result = await step.run(`match-order-${order.id}`, async () => {
        try {
          return await matchOpenLimitOrderTx(order.id, instrument);
        } catch (err) {
          logInternalError("orders.limit_match_failed", err);
          return { status: "error" as const };
        }
      });
      if (result.status === "filled") filled += 1;
    }

    return { checked: candidates.length, filled };
  },
);
