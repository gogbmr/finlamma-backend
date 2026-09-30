// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real unique/FK constraints and cursor behavior
// actually hold at the database level. Never touches the real Supabase
// database (see @/db/client's NODE_ENV=test guard).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { notifications, users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  countUnreadNotifications,
  deleteNotificationsOlderThan,
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
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

async function makeUser(overrides: Partial<{ language: "en" | "hi" | "hx" }> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: uniqueClerkUserId("notifications-repo-user"),
      clerkUpdatedAt: new Date(),
      firstName: "Aarav",
      lastInitial: "S",
      ...(overrides.language ? { language: overrides.language } : {}),
    })
    .returning();
  return user;
}

const TITLE = { en: "Title en", hi: "Title hi", hx: "Title hx" };
const BODY = { en: "Body en", hi: "Body hi", hx: "Body hx" };

describe("getUserLanguageForNotifications", () => {
  it("returns the user's language and deletedAt", async () => {
    const user = await makeUser({ language: "hi" });

    expect(await getUserLanguageForNotifications(user.id)).toEqual({ language: "hi", deletedAt: null });
  });

  it("returns null for a nonexistent user", async () => {
    expect(await getUserLanguageForNotifications(randomUUID())).toBeNull();
  });
});

describe("push tokens", () => {
  it("registers a token and lists it for the user", async () => {
    const user = await makeUser();
    const token = `ExponentPushToken[${randomUUID()}]`;

    await upsertPushToken({ userId: user.id, expoPushToken: token, platform: "ios" });
    const tokens = await listPushTokensForUser(user.id);

    expect(tokens.map((t) => t.expoPushToken)).toEqual([token]);
    expect(tokens[0]!.platform).toBe("ios");
  });

  it("reassigns an existing token to a new user rather than duplicating it", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const token = `ExponentPushToken[${randomUUID()}]`;

    await upsertPushToken({ userId: userA.id, expoPushToken: token, platform: "ios" });
    await upsertPushToken({ userId: userB.id, expoPushToken: token, platform: "android" });

    expect(await listPushTokensForUser(userA.id)).toEqual([]);
    const tokensB = await listPushTokensForUser(userB.id);
    expect(tokensB).toHaveLength(1);
    expect(tokensB[0]!.platform).toBe("android");
  });

  it("deletePushTokenByValue only deletes the caller's own token", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const tokenA = `ExponentPushToken[${randomUUID()}]`;
    const tokenB = `ExponentPushToken[${randomUUID()}]`;
    await upsertPushToken({ userId: userA.id, expoPushToken: tokenA, platform: "ios" });
    await upsertPushToken({ userId: userB.id, expoPushToken: tokenB, platform: "ios" });

    await deletePushTokenByValue(userA.id, tokenB); // wrong owner - no-op
    expect(await listPushTokensForUser(userB.id)).toHaveLength(1);

    await deletePushTokenByValue(userA.id, tokenA);
    expect(await listPushTokensForUser(userA.id)).toEqual([]);
  });

  it("deletePushTokenById removes it regardless of owner (used to prune invalid tokens)", async () => {
    const user = await makeUser();
    const token = `ExponentPushToken[${randomUUID()}]`;
    const row = await upsertPushToken({ userId: user.id, expoPushToken: token, platform: "ios" });

    await deletePushTokenById(row.id);

    expect(await listPushTokensForUser(user.id)).toEqual([]);
  });
});

describe("notification prefs", () => {
  it("returns null when no row exists yet", async () => {
    const user = await makeUser();
    expect(await getNotificationPrefsRow(user.id)).toBeNull();
  });

  it("upsertNotificationPrefs creates a row with defaults for unspecified fields", async () => {
    const user = await makeUser();

    const row = await upsertNotificationPrefs(user.id, { enabled: false });

    expect(row.enabled).toBe(false);
    expect(row.quietHours).toBeNull();
    expect(row.disabledCategories).toEqual([]);
  });

  it("upsertNotificationPrefs merges a later partial patch onto the existing row, not the defaults", async () => {
    const user = await makeUser();
    await upsertNotificationPrefs(user.id, { enabled: false, disabledCategories: ["market_news"] });

    const row = await upsertNotificationPrefs(user.id, { quietHours: { startHourIst: 22, endHourIst: 6 } });

    expect(row.enabled).toBe(false); // preserved from the first call
    expect(row.disabledCategories).toEqual(["market_news"]); // preserved
    expect(row.quietHours).toEqual({ startHourIst: 22, endHourIst: 6 }); // newly set
  });

  it("quietHours: null explicitly clears a previously-set override", async () => {
    const user = await makeUser();
    await upsertNotificationPrefs(user.id, { quietHours: { startHourIst: 22, endHourIst: 6 } });

    const row = await upsertNotificationPrefs(user.id, { quietHours: null });

    expect(row.quietHours).toBeNull();
  });
});

describe("notifications feed", () => {
  it("insertNotification stores full localized title/body", async () => {
    const user = await makeUser();

    const row = await insertNotification({ userId: user.id, kind: "session_goal", title: TITLE, body: BODY });

    expect(row.title).toEqual(TITLE);
    expect(row.body).toEqual(BODY);
    expect(row.readAt).toBeNull();
  });

  it("listNotificationsPage returns newest-first with a before cursor", async () => {
    const user = await makeUser();
    const a = await insertNotification({ userId: user.id, kind: "session_goal", title: TITLE, body: BODY });
    await new Promise((r) => setTimeout(r, 2));
    const b = await insertNotification({ userId: user.id, kind: "boss_battle", title: TITLE, body: BODY });
    await new Promise((r) => setTimeout(r, 2));
    const c = await insertNotification({ userId: user.id, kind: "streak_risk", title: TITLE, body: BODY });

    const firstPage = await listNotificationsPage(user.id, { limit: 2 });
    expect(firstPage.map((n) => n.id)).toEqual([c.id, b.id]);

    const secondPage = await listNotificationsPage(user.id, { limit: 2, before: firstPage[1]!.createdAt });
    expect(secondPage.map((n) => n.id)).toEqual([a.id]);
  });

  it("only returns the given user's own notifications", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await insertNotification({ userId: userA.id, kind: "session_goal", title: TITLE, body: BODY });
    await insertNotification({ userId: userB.id, kind: "session_goal", title: TITLE, body: BODY });

    const rows = await listNotificationsPage(userA.id, { limit: 20 });

    expect(rows.every((r) => r.userId === userA.id)).toBe(true);
  });

  it("countUnreadNotifications / markNotificationsRead", async () => {
    const user = await makeUser();
    const a = await insertNotification({ userId: user.id, kind: "session_goal", title: TITLE, body: BODY });
    const b = await insertNotification({ userId: user.id, kind: "boss_battle", title: TITLE, body: BODY });

    expect(await countUnreadNotifications(user.id)).toBe(2);

    await markNotificationsRead(user.id, [a.id]);
    expect(await countUnreadNotifications(user.id)).toBe(1);

    await markNotificationsRead(user.id); // no ids = mark all
    expect(await countUnreadNotifications(user.id)).toBe(0);

    const page = await listNotificationsPage(user.id, { limit: 20 });
    expect(page.find((n) => n.id === b.id)?.readAt).not.toBeNull();
  });

  it("markNotificationsRead never marks another user's notification", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const notif = await insertNotification({ userId: userB.id, kind: "session_goal", title: TITLE, body: BODY });

    await markNotificationsRead(userA.id, [notif.id]);

    const page = await listNotificationsPage(userB.id, { limit: 20 });
    expect(page[0]!.readAt).toBeNull();
  });

  it("deleteNotificationsOlderThan removes only rows past the cutoff", async () => {
    const user = await makeUser();
    const old = await insertNotification({ userId: user.id, kind: "session_goal", title: TITLE, body: BODY });
    const recent = await insertNotification({ userId: user.id, kind: "boss_battle", title: TITLE, body: BODY });

    // Backdate the "old" row directly (retention is normally days, not ms).
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db.update(notifications).set({ createdAt: fortyDaysAgo }).where(eq(notifications.id, old.id));

    const deletedCount = await deleteNotificationsOlderThan(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    expect(deletedCount).toBe(1);
    const remaining = await listNotificationsPage(user.id, { limit: 20 });
    expect(remaining.map((r) => r.id)).toEqual([recent.id]);
  });
});

describe("hasNotificationSince", () => {
  it("is true once a matching-kind notification exists since the cutoff", async () => {
    const user = await makeUser();
    const since = new Date(Date.now() - 60_000);

    expect(await hasNotificationSince(user.id, "session_goal", since)).toBe(false);

    await insertNotification({ userId: user.id, kind: "session_goal", title: TITLE, body: BODY });

    expect(await hasNotificationSince(user.id, "session_goal", since)).toBe(true);
  });

  it("does not match a different kind", async () => {
    const user = await makeUser();
    const since = new Date(Date.now() - 60_000);
    await insertNotification({ userId: user.id, kind: "boss_battle", title: TITLE, body: BODY });

    expect(await hasNotificationSince(user.id, "session_goal", since)).toBe(false);
  });

  it("does not match a notification older than the cutoff", async () => {
    const user = await makeUser();
    const notif = await insertNotification({ userId: user.id, kind: "session_goal", title: TITLE, body: BODY });
    await db
      .update(notifications)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(notifications.id, notif.id));

    expect(await hasNotificationSince(user.id, "session_goal", new Date())).toBe(false);
  });
});
