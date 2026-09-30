import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationPrefs, notifications, pushTokens, users, type NotificationKind } from "@/db/schema";
import type { LocalizedText } from "@/db/schema/_helpers";

export async function getUserLanguageForNotifications(userId: string) {
  const [row] = await db
    .select({ language: users.language, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

// --- Push tokens ---

// One row per token, reassigned to whichever user most recently registered
// it (a reinstall/different sign-in on the same device gets a fresh Expo
// token anyway, but this keeps a stale reassignment impossible either way).
export async function upsertPushToken(input: {
  userId: string;
  expoPushToken: string;
  platform: "ios" | "android";
}) {
  const [row] = await db
    .insert(pushTokens)
    .values({ userId: input.userId, expoPushToken: input.expoPushToken, platform: input.platform })
    .onConflictDoUpdate({
      target: pushTokens.expoPushToken,
      set: { userId: input.userId, platform: input.platform, lastSeenAt: new Date() },
    })
    .returning();
  return row;
}

export async function deletePushTokenByValue(userId: string, expoPushToken: string) {
  await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.userId, userId), eq(pushTokens.expoPushToken, expoPushToken)));
}

export async function deletePushTokenById(id: string) {
  await db.delete(pushTokens).where(eq(pushTokens.id, id));
}

export async function listPushTokensForUser(userId: string) {
  return db.select().from(pushTokens).where(eq(pushTokens.userId, userId));
}

// --- Notification preferences ---

export async function getNotificationPrefsRow(userId: string) {
  const [row] = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId)).limit(1);
  return row ?? null;
}

// Insert-if-missing then apply `patch` - read-modify-write rather than a
// single partial UPDATE, since `patch` only carries the fields the caller
// actually wants to change (see UpdateNotificationPrefsInputSchema) and
// jsonb columns (quietHours, disabledCategories) can't be partially merged
// by Postgres on their own.
export async function upsertNotificationPrefs(
  userId: string,
  patch: { enabled?: boolean; quietHours?: { startHourIst: number; endHourIst: number } | null; disabledCategories?: NotificationKind[] },
) {
  const existing = await getNotificationPrefsRow(userId);
  const next = {
    enabled: patch.enabled ?? existing?.enabled ?? true,
    quietHours: patch.quietHours !== undefined ? patch.quietHours : (existing?.quietHours ?? null),
    disabledCategories: patch.disabledCategories ?? existing?.disabledCategories ?? [],
  };

  const [row] = await db
    .insert(notificationPrefs)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: notificationPrefs.userId, set: next })
    .returning();
  return row;
}

// --- Notification feed ---

export async function insertNotification(input: {
  userId: string;
  kind: NotificationKind;
  title: LocalizedText;
  body: LocalizedText;
  data?: Record<string, unknown>;
}) {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      data: input.data ?? null,
    })
    .returning();
  return row;
}

// Newest-first with a "load older" cursor - same convention as every other
// list endpoint in this codebase (doubt_messages, wallet ledger history).
export async function listNotificationsPage(userId: string, opts: { limit: number; before?: Date }) {
  const conditions = [eq(notifications.userId, userId)];
  if (opts.before) conditions.push(lt(notifications.createdAt, opts.before));
  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}

// ids given: only those ids, still scoped to userId so one learner can
// never mark another's notification read. ids omitted: every currently-
// unread row for this user (PR-29's "mark-all-read").
export async function markNotificationsRead(userId: string, ids?: string[]) {
  const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (ids && ids.length > 0) conditions.push(inArray(notifications.id, ids));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}

// WH-20's retention sweep (src/inngest/functions) - deletes rows older than
// the configured cutoff regardless of read status.
export async function deleteNotificationsOlderThan(cutoff: Date): Promise<number> {
  const deleted = await db.delete(notifications).where(lt(notifications.createdAt, cutoff)).returning({ id: notifications.id });
  return deleted.length;
}
