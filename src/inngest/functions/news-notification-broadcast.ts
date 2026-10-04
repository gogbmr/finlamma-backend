import { inngest } from "@/lib/inngest";
import { broadcastPendingNewsNotifications } from "@/server/news/service";

// Runs after each drafting slot (news-draft.ts, 09:30/13:30/17:30 IST) - a
// staff member publishing a draft any time in between just waits for the
// next slot, same latency the drafting pipeline itself already has. Only
// ever notifies a PUBLISHED story once (news_stories.notifiedAt), and only
// engaged readers (src/server/news/repo.ts's listRecentlyEngagedNewsReaderIds
// - learners who read news in the last 30 days), never every account.
// storyLimit bounds one run's fan-out size - if more than 5 stories are
// ever pending at once (e.g. this feature's first run, with a backlog of
// already-published stories predating notifiedAt), the rest catch up on
// the next run rather than one run pushing an unbounded number of
// notifications.
export const newsNotificationBroadcastJob = inngest.createFunction(
  { id: "news-notification-broadcast", triggers: [{ cron: "TZ=Asia/Kolkata 0 10,14,18 * * *" }] },
  async ({ step }) => {
    return step.run("broadcast", () =>
      broadcastPendingNewsNotifications({ storyLimit: 5, engagementWindowDays: 30 }),
    );
  },
);
