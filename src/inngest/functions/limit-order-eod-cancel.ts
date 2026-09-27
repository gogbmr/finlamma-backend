import { istDateString } from "@/lib/ist-date";
import { inngest } from "@/lib/inngest";
import { cancelAllOpenOrdersTx } from "@/server/orders/repo";
import { listMarketHolidays } from "@/server/trading/repo";

// Checkpoint 6 (docs/ARCHITECTURE.md D42): "LIMIT orders outside market
// hours stay OPEN until matched or cancelled at day end." Runs once, right
// after the 15:30 IST close, Mon-Fri. Skips entirely on a market holiday
// that happens to fall on a weekday - the exchange never opened that day
// (the matching job never even attempted these orders), so cancelling them
// today would end their queue-until-next-open lifetime one day early for no
// reason; they simply wait for the next real trading day's close instead.
export const limitOrderEodCancelJob = inngest.createFunction(
  { id: "limit-order-eod-cancel", triggers: [{ cron: "TZ=Asia/Kolkata 35 15 * * 1-5" }] },
  async ({ step }) => {
    const isHoliday = await step.run("check-holiday", async () => {
      const holidays = await listMarketHolidays();
      const today = istDateString();
      return holidays.some((h) => h.date === today);
    });

    if (isHoliday) return { skipped: "holiday" as const, cancelled: 0 };

    const cancelled = await step.run("cancel-open-orders", () => cancelAllOpenOrdersTx());

    return { skipped: null, cancelled };
  },
);
