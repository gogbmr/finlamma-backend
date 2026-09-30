import { logActivity } from "@/lib/activity-log";
import type { requestMeta } from "@/lib/http";
import { getSettingJson, setSettingJson } from "@/lib/settings";
import {
  DEFAULT_NOTIFICATIONS_SETTINGS,
  NOTIFICATIONS_SETTINGS_KEY,
  NotificationsSettingsSchema,
  type NotificationsSettings,
} from "./schemas";

type RequestMeta = ReturnType<typeof requestMeta>;

export async function getNotificationsSettings(): Promise<NotificationsSettings> {
  const raw = await getSettingJson(NOTIFICATIONS_SETTINGS_KEY);
  if (raw === null) return DEFAULT_NOTIFICATIONS_SETTINGS;
  const parsed = NotificationsSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATIONS_SETTINGS;
}

export async function updateNotificationsSettings(
  actor: { id: string },
  input: NotificationsSettings,
  meta: RequestMeta,
): Promise<NotificationsSettings> {
  const previous = await getNotificationsSettings();
  await setSettingJson(
    NOTIFICATIONS_SETTINGS_KEY,
    input,
    "Notification defaults: quiet hours window (kid-safe - no push overnight unless a learner " +
      "overrides it) and feed retention days (WH-20). Editable only by super_admin " +
      "(settings.manage), logged.",
  );

  await logActivity({
    actorType: "staff",
    actorId: actor.id,
    action: "settings.notifications_updated",
    targetType: "settings_kv",
    targetId: NOTIFICATIONS_SETTINGS_KEY,
    metadata: { previous, next: input },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return input;
}
