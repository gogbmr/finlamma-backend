import { z } from "zod";
import { logActivity } from "@/lib/activity-log";
import { decodeCursor, encodeCursor, logInternalError, type requestMeta } from "@/lib/http";
import { istMinutesSinceMidnight } from "@/lib/ist-date";
import type { NotificationKind } from "@/db/schema";
import type { LocalizedText } from "@/db/schema/_helpers";
import { getPushProvider } from "./provider";
import {
  countUnreadNotifications,
  deletePushTokenById,
  deletePushTokenByValue,
  getNotificationPrefsRow,
  getUserLanguageForNotifications,
  hasNotificationSince,
  insertNotification,
  listNotificationsPage,
  listPushTokensForUser,
  markNotificationsRead,
  upsertNotificationPrefs,
  upsertPushToken,
} from "./repo";
import { NotificationQuietHoursSchema, type RegisterPushTokenInput, type UpdateNotificationPrefsInput } from "./schemas";
import { getNotificationsSettings } from "./settings";

type RequestMeta = ReturnType<typeof requestMeta>;
type QuietHours = z.infer<typeof NotificationQuietHoursSchema>;

// --- Push token registration ---

export async function registerPushToken(
  user: { id: string },
  input: RegisterPushTokenInput,
  meta: RequestMeta,
): Promise<void> {
  const { previousUserId } = await upsertPushToken({
    userId: user.id,
    expoPushToken: input.expoPushToken,
    platform: input.platform,
  });
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "notifications.push_token_registered",
    targetType: "push_token",
    targetId: null,
    metadata: { platform: input.platform },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  // /phase-audit 7 finding: a token belonging to a different account just
  // got silently reassigned to this one (e.g. the same physical token
  // string was resubmitted by someone else - could be a legitimate
  // reinstall-onto-a-different-account, or could be a leaked token). Never
  // logs the token value itself, only which two accounts were involved, so
  // this is traceable without adding a new way to leak the token.
  if (previousUserId) {
    await logActivity({
      actorType: "user",
      actorId: user.id,
      action: "notifications.push_token_reassigned",
      targetType: "push_token",
      targetId: null,
      metadata: { previousUserId, newUserId: user.id, platform: input.platform },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}

export async function unregisterPushToken(
  user: { id: string },
  expoPushToken: string,
  meta: RequestMeta,
): Promise<void> {
  await deletePushTokenByValue(user.id, expoPushToken);
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "notifications.push_token_unregistered",
    targetType: "push_token",
    targetId: null,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

// --- Notification preferences ---

export async function getMyNotificationPrefs(user: { id: string }) {
  const [row, settings] = await Promise.all([getNotificationPrefsRow(user.id), getNotificationsSettings()]);
  return {
    enabled: row?.enabled ?? true,
    quietHours: row?.quietHours ?? settings.defaultQuietHours,
    disabledCategories: row?.disabledCategories ?? [],
  };
}

export async function updateMyNotificationPrefs(
  user: { id: string },
  input: UpdateNotificationPrefsInput,
  meta: RequestMeta,
) {
  const row = await upsertNotificationPrefs(user.id, input);
  await logActivity({
    actorType: "user",
    actorId: user.id,
    action: "notifications.prefs_updated",
    targetType: "notification_prefs",
    targetId: row.id,
    metadata: { enabled: row.enabled, hasQuietHoursOverride: row.quietHours !== null, disabledCategories: row.disabledCategories },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  const settings = await getNotificationsSettings();
  return {
    enabled: row.enabled,
    quietHours: row.quietHours ?? settings.defaultQuietHours,
    disabledCategories: row.disabledCategories,
  };
}

// --- Notification feed ---

export async function listMyNotifications(user: { id: string }, opts: { limit: number; cursor: string | null }) {
  const [language, cursorParsed] = await Promise.all([
    getUserLanguageForNotifications(user.id),
    Promise.resolve(decodeCursor<{ createdAt: string }>(opts.cursor)),
  ]);
  const rows = await listNotificationsPage(user.id, {
    limit: opts.limit,
    before: cursorParsed ? new Date(cursorParsed.createdAt) : undefined,
  });
  const last = rows[rows.length - 1];
  const nextCursor = rows.length === opts.limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString() }) : null;

  const lang = language?.language ?? "hx";
  return {
    data: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title[lang],
      body: r.body[lang],
      data: r.data,
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor,
  };
}

export async function getMyUnreadNotificationCount(user: { id: string }): Promise<number> {
  return countUnreadNotifications(user.id);
}

export async function markMyNotificationsRead(user: { id: string }, ids?: string[]): Promise<void> {
  await markNotificationsRead(user.id, ids);
}

// --- Central dispatcher - every trigger (Checkpoint 7) calls this, never
// repo.insertNotification / the push provider directly. ---

// `startHourIst > endHourIst` means the window wraps past midnight (the
// kid-safe default, 21-7) - `hour >= start OR hour < end`. A non-wrapping
// window (e.g. 13-14, a lunch-hour quiet period) is `start <= hour < end`.
export function isWithinQuietHours(nowIstMinutes: number, quietHours: QuietHours): boolean {
  const hour = Math.floor(nowIstMinutes / 60);
  const { startHourIst: start, endHourIst: end } = quietHours;
  if (start === end) return false; // a zero-width window never counts as "quiet"
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

// Never throws - a trigger job's own work (crediting XP, settling a league,
// publishing a story) must never fail because a notification couldn't be
// sent. Silently no-ops for a deleted/nonexistent user, an opted-out user
// (globally or for this specific kind - no row is written at all, matching
// "off means off"), and during quiet hours (the in-app feed row is still
// written - only the push send is skipped).
export async function notifyUser(
  userId: string,
  kind: NotificationKind,
  copy: { title: LocalizedText; body: LocalizedText },
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const user = await getUserLanguageForNotifications(userId);
    if (!user || user.deletedAt) return;

    const [prefsRow, settings] = await Promise.all([getNotificationPrefsRow(userId), getNotificationsSettings()]);
    const enabled = prefsRow?.enabled ?? true;
    const disabledCategories = prefsRow?.disabledCategories ?? [];
    if (!enabled || disabledCategories.includes(kind)) return;

    await insertNotification({ userId, kind, title: copy.title, body: copy.body, data });

    const quietHours = prefsRow?.quietHours ?? settings.defaultQuietHours;
    if (isWithinQuietHours(istMinutesSinceMidnight(new Date()), quietHours)) return;

    const tokens = await listPushTokensForUser(userId);
    if (tokens.length === 0) return;

    const provider = getPushProvider();
    const results = await provider.send(
      tokens.map((t) => ({
        expoPushToken: t.expoPushToken,
        title: copy.title[user.language],
        body: copy.body[user.language],
        data,
      })),
    );
    await Promise.all(
      results.map((result, i) => (result.status === "invalid_token" ? deletePushTokenById(tokens[i]!.id) : undefined)),
    );
  } catch (err) {
    logInternalError("notifications.notify_user_failed", err);
  }
}

// Dedup helper for a cron-driven trigger with no discrete completion event
// to key off of (session_goal - see src/server/streaks... no, see
// src/server/daily-goals/service.ts's own doc comment on why daily goals
// have nothing to hook a mutation onto). `since` is normally today's IST
// midnight, so this answers "has this learner already gotten this kind of
// notification today".
export async function hasBeenNotifiedSince(userId: string, kind: NotificationKind, since: Date): Promise<boolean> {
  return hasNotificationSince(userId, kind, since);
}
