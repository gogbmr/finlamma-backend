import { inngest } from "@/lib/inngest";
import { ingestLatestNews } from "@/server/news/service";

// D50 (docs/ARCHITECTURE.md): pulls from getNewsProvider(), which only ever
// returns MockNewsProvider until a real vendor is licensed - this job's own
// code never changes when that happens, only the provider it's fed by.
// Runs a few times a day (not once, since a real vendor's headlines arrive
// throughout the day) - mirrors amfi-nav-ingest.ts's "one daily cron" shape
// but at a cadence suited to news rather than once-a-day NAV data.
export const newsIngestJob = inngest.createFunction(
  { id: "news-ingest", triggers: [{ cron: "TZ=Asia/Kolkata 0 9,13,17 * * *" }] },
  async ({ step }) => {
    const result = await step.run("ingest", () => ingestLatestNews());
    return result;
  },
);
