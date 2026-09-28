import { inngest } from "@/lib/inngest";
import { draftPendingStories } from "@/server/news/service";

// Runs shortly after each ingestion window (news-ingest.ts) - turns any
// raw item with no drafted story yet into a draft news_stories row (never
// published automatically, CLAUDE.md rule 11). A single item's AI failure
// is logged and skipped inside draftPendingStories itself, same "one bad
// item never blocks the batch" pattern as amfi-nav-ingest.ts.
export const newsDraftJob = inngest.createFunction(
  { id: "news-draft", triggers: [{ cron: "TZ=Asia/Kolkata 30 9,13,17 * * *" }] },
  async ({ step }) => {
    const result = await step.run("draft", () => draftPendingStories());
    return result;
  },
);
