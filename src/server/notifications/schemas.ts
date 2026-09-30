import { z } from "zod";
import { registry } from "@/lib/openapi";

export const NotificationKindSchema = z.enum([
  "streak_risk",
  "boss_battle",
  "market_news",
  "session_goal",
  "cheer_received",
  "league_rank_change",
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

// --- Push token registration (learner-facing) ---

export const PushPlatformSchema = z.enum(["ios", "android"]);

export const RegisterPushTokenInputSchema = z.object({
  // Expo's own format is "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" - a
  // loose prefix check here (not Expo.isExpoPushToken, which would make
  // this schema depend on the push vendor SDK) is enough to reject an
  // obviously-wrong value before it ever reaches the provider.
  expoPushToken: z
    .string()
    .min(1)
    .max(200)
    .openapi({ example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }),
  platform: PushPlatformSchema,
});
export type RegisterPushTokenInput = z.infer<typeof RegisterPushTokenInputSchema>;

export const UnregisterPushTokenInputSchema = z.object({
  expoPushToken: z.string().min(1).max(200),
});

export const RegisterPushTokenResponseSchema = registry.register(
  "RegisterPushTokenResponse",
  z.object({ registered: z.literal(true) }),
);
export const UnregisterPushTokenResponseSchema = registry.register(
  "UnregisterPushTokenResponse",
  z.object({ unregistered: z.literal(true) }),
);

// --- Notification preferences (learner-facing) ---

export const NotificationQuietHoursSchema = z.object({
  startHourIst: z.number().int().min(0).max(23),
  endHourIst: z.number().int().min(0).max(23),
});

export const NotificationPrefsResponseSchema = registry.register(
  "NotificationPrefs",
  z.object({
    enabled: z.boolean(),
    // Resolved: the learner's own override if set, else settings_kv's
    // global default - the client never needs to know which one it is.
    quietHours: NotificationQuietHoursSchema,
    disabledCategories: z.array(NotificationKindSchema),
  }),
);

export const UpdateNotificationPrefsInputSchema = z.object({
  enabled: z.boolean().optional(),
  // null clears a personal override back to the global default; omitted
  // leaves the current value unchanged.
  quietHours: NotificationQuietHoursSchema.nullable().optional(),
  disabledCategories: z.array(NotificationKindSchema).optional(),
});
export type UpdateNotificationPrefsInput = z.infer<typeof UpdateNotificationPrefsInputSchema>;

// --- Notification feed (learner-facing) ---

export const NotificationResponseSchema = registry.register(
  "Notification",
  z.object({
    id: z.string().uuid(),
    kind: NotificationKindSchema,
    // Already resolved to the caller's own language - see threadDisclosureMessage
    // in src/server/doubt-zone/schemas.ts for the same "resolve server-side"
    // convention.
    title: z.string(),
    body: z.string(),
    data: z.record(z.string(), z.unknown()).nullable(),
    readAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  }),
);

export const NotificationsListResponseSchema = registry.register(
  "NotificationsListResponse",
  z.object({
    data: z.array(NotificationResponseSchema),
    nextCursor: z.string().nullable(),
  }),
);

export const MarkNotificationsReadInputSchema = z.object({
  // Omitted = mark every currently-unread notification as read (PR-29's
  // "mark-all-read"). Given = mark only these ids (all must belong to the
  // caller - see service.ts).
  ids: z.array(z.string().uuid()).optional(),
});

// --- settings_kv "notifications" (admin-editable global defaults) ---

export const NotificationsSettingsSchema = z.object({
  // Kid-safe default: no push between 9pm and 7am IST unless the learner
  // (or, later, a parent-facing control) explicitly overrides it via their
  // own notification_prefs.quiet_hours. Whole IST hours only - matches
  // notification_prefs.quiet_hours' own {startHourIst,endHourIst} shape
  // (src/db/schema/notifications.ts).
  defaultQuietHours: NotificationQuietHoursSchema,
  // WH-20: "notifications 30 din baad khud hat jaate hain" - the retention
  // Inngest job (src/inngest/functions) deletes notifications rows older
  // than this many days.
  retentionDays: z.number().int().positive(),
});
export type NotificationsSettings = z.infer<typeof NotificationsSettingsSchema>;

export const DEFAULT_NOTIFICATIONS_SETTINGS: NotificationsSettings = {
  defaultQuietHours: { startHourIst: 21, endHourIst: 7 },
  retentionDays: 30,
};

export const NOTIFICATIONS_SETTINGS_KEY = "notifications";
