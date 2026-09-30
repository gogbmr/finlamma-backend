import { inngest } from "@/lib/inngest";
import { deleteNotificationsOlderThan } from "@/server/notifications/repo";
import { getNotificationsSettings } from "@/server/notifications/settings";

// WH-20: "Notifications 30 din baad khud hat jaate hain" (notifications
// auto-expire after 30 days). Once daily, off-peak IST hours. retentionDays
// is settings_kv-editable (src/server/notifications/schemas.ts), default 30.
export const notificationsRetentionJob = inngest.createFunction(
  { id: "notifications-retention", triggers: [{ cron: "TZ=Asia/Kolkata 15 3 * * *" }] },
  async ({ step }) => {
    const settings = await step.run("get-settings", () => getNotificationsSettings());
    const cutoff = new Date(Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000);
    const deletedCount = await step.run("delete-expired", () => deleteNotificationsOlderThan(cutoff));
    return { deletedCount };
  },
);
