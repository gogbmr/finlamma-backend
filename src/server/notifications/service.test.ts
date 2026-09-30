import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATIONS_SETTINGS } from "./schemas";

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({ logActivity: (input: unknown) => mockLogActivity(input) }));

const mockRepo = {
  countUnreadNotifications: vi.fn(),
  deletePushTokenById: vi.fn(),
  deletePushTokenByValue: vi.fn(),
  getNotificationPrefsRow: vi.fn(),
  getUserLanguageForNotifications: vi.fn(),
  hasNotificationSince: vi.fn(),
  insertNotification: vi.fn(),
  listNotificationsPage: vi.fn(),
  listPushTokensForUser: vi.fn(),
  markNotificationsRead: vi.fn(),
  upsertNotificationPrefs: vi.fn(),
  upsertPushToken: vi.fn(),
};
vi.mock("./repo", () => mockRepo);

const mockGetPushProvider = vi.fn();
vi.mock("./provider", () => ({ getPushProvider: () => mockGetPushProvider() }));

const mockGetNotificationsSettings = vi.fn();
vi.mock("./settings", () => ({ getNotificationsSettings: () => mockGetNotificationsSettings() }));

const {
  getMyNotificationPrefs,
  getMyUnreadNotificationCount,
  hasBeenNotifiedSince,
  isWithinQuietHours,
  listMyNotifications,
  markMyNotificationsRead,
  notifyUser,
  registerPushToken,
  unregisterPushToken,
  updateMyNotificationPrefs,
} = await import("./service");

const USER = { id: "user_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const TITLE = { en: "T en", hi: "T hi", hx: "T hx" };
const BODY = { en: "B en", hi: "B hi", hx: "B hx" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetNotificationsSettings.mockResolvedValue(DEFAULT_NOTIFICATIONS_SETTINGS);
});

describe("isWithinQuietHours", () => {
  it("handles a wrapping window (21-7)", () => {
    const qh = { startHourIst: 21, endHourIst: 7 };
    expect(isWithinQuietHours(22 * 60, qh)).toBe(true); // 10pm
    expect(isWithinQuietHours(3 * 60, qh)).toBe(true); // 3am
    expect(isWithinQuietHours(12 * 60, qh)).toBe(false); // noon
    expect(isWithinQuietHours(7 * 60, qh)).toBe(false); // exactly the end hour - not quiet
    expect(isWithinQuietHours(21 * 60, qh)).toBe(true); // exactly the start hour - quiet
  });

  it("handles a non-wrapping window", () => {
    const qh = { startHourIst: 13, endHourIst: 14 };
    expect(isWithinQuietHours(13 * 60 + 30, qh)).toBe(true);
    expect(isWithinQuietHours(15 * 60, qh)).toBe(false);
  });

  it("a zero-width window is never quiet", () => {
    expect(isWithinQuietHours(10 * 60, { startHourIst: 5, endHourIst: 5 })).toBe(false);
  });
});

describe("registerPushToken / unregisterPushToken", () => {
  it("registers, never logging the token value itself", async () => {
    await registerPushToken(USER, { expoPushToken: "ExponentPushToken[secret]", platform: "ios" }, META);

    expect(mockRepo.upsertPushToken).toHaveBeenCalledWith({
      userId: "user_1",
      expoPushToken: "ExponentPushToken[secret]",
      platform: "ios",
    });
    const loggedMetadata = mockLogActivity.mock.calls[0]![0].metadata;
    expect(JSON.stringify(loggedMetadata)).not.toContain("secret");
  });

  it("unregisters", async () => {
    await unregisterPushToken(USER, "ExponentPushToken[x]", META);

    expect(mockRepo.deletePushTokenByValue).toHaveBeenCalledWith("user_1", "ExponentPushToken[x]");
  });
});

describe("getMyNotificationPrefs / updateMyNotificationPrefs", () => {
  it("resolves quietHours to the global default when no row/override exists", async () => {
    mockRepo.getNotificationPrefsRow.mockResolvedValueOnce(null);

    const result = await getMyNotificationPrefs(USER);

    expect(result).toEqual({
      enabled: true,
      quietHours: DEFAULT_NOTIFICATIONS_SETTINGS.defaultQuietHours,
      disabledCategories: [],
    });
  });

  it("resolves quietHours to the learner's own override when set", async () => {
    mockRepo.getNotificationPrefsRow.mockResolvedValueOnce({
      enabled: false,
      quietHours: { startHourIst: 1, endHourIst: 2 },
      disabledCategories: ["market_news"],
    });

    const result = await getMyNotificationPrefs(USER);

    expect(result).toEqual({ enabled: false, quietHours: { startHourIst: 1, endHourIst: 2 }, disabledCategories: ["market_news"] });
  });

  it("updateMyNotificationPrefs writes through the repo and logs (without leaking full prefs unnecessarily)", async () => {
    mockRepo.upsertNotificationPrefs.mockResolvedValueOnce({
      id: "prefs_1",
      enabled: false,
      quietHours: null,
      disabledCategories: [],
    });

    const result = await updateMyNotificationPrefs(USER, { enabled: false }, META);

    expect(result.enabled).toBe(false);
    expect(result.quietHours).toEqual(DEFAULT_NOTIFICATIONS_SETTINGS.defaultQuietHours);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "notifications.prefs_updated", targetId: "prefs_1" }),
    );
  });
});

describe("listMyNotifications / getMyUnreadNotificationCount / markMyNotificationsRead", () => {
  it("resolves title/body to the caller's own language", async () => {
    mockRepo.getUserLanguageForNotifications.mockResolvedValueOnce({ language: "hi", deletedAt: null });
    mockRepo.listNotificationsPage.mockResolvedValueOnce([
      { id: "n1", kind: "session_goal", title: TITLE, body: BODY, data: null, readAt: null, createdAt: new Date("2026-09-30T00:00:00Z") },
    ]);

    const result = await listMyNotifications(USER, { limit: 20, cursor: null });

    expect(result.data[0]).toMatchObject({ title: "T hi", body: "B hi" });
  });

  it("falls back to hx when the user row can't be found", async () => {
    mockRepo.getUserLanguageForNotifications.mockResolvedValueOnce(null);
    mockRepo.listNotificationsPage.mockResolvedValueOnce([
      { id: "n1", kind: "session_goal", title: TITLE, body: BODY, data: null, readAt: null, createdAt: new Date() },
    ]);

    const result = await listMyNotifications(USER, { limit: 20, cursor: null });

    expect(result.data[0]).toMatchObject({ title: "T hx", body: "B hx" });
  });

  it("getMyUnreadNotificationCount / markMyNotificationsRead delegate straight through", async () => {
    mockRepo.countUnreadNotifications.mockResolvedValueOnce(3);
    expect(await getMyUnreadNotificationCount(USER)).toBe(3);

    await markMyNotificationsRead(USER, ["a", "b"]);
    expect(mockRepo.markNotificationsRead).toHaveBeenCalledWith("user_1", ["a", "b"]);
  });
});

describe("notifyUser", () => {
  beforeEach(() => {
    mockRepo.getUserLanguageForNotifications.mockResolvedValue({ language: "en", deletedAt: null });
    mockRepo.getNotificationPrefsRow.mockResolvedValue(null);
    mockRepo.listPushTokensForUser.mockResolvedValue([]);
  });

  it("does nothing for a deleted or nonexistent user", async () => {
    mockRepo.getUserLanguageForNotifications.mockResolvedValueOnce(null);

    await notifyUser("ghost", "session_goal", { title: TITLE, body: BODY });

    expect(mockRepo.insertNotification).not.toHaveBeenCalled();
  });

  it("writes nothing at all when notifications are globally disabled", async () => {
    mockRepo.getNotificationPrefsRow.mockResolvedValueOnce({ enabled: false, quietHours: null, disabledCategories: [] });

    await notifyUser("u1", "session_goal", { title: TITLE, body: BODY });

    expect(mockRepo.insertNotification).not.toHaveBeenCalled();
  });

  it("writes nothing at all when this specific category is disabled, even with the global switch on", async () => {
    mockRepo.getNotificationPrefsRow.mockResolvedValueOnce({
      enabled: true,
      quietHours: null,
      disabledCategories: ["session_goal"],
    });

    await notifyUser("u1", "session_goal", { title: TITLE, body: BODY });

    expect(mockRepo.insertNotification).not.toHaveBeenCalled();
  });

  it("writes the in-app notification but skips the push send during quiet hours", async () => {
    // Pin "now" to 2am IST (20:30 UTC the previous day) - inside the
    // default 21-7 quiet window.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T20:30:00.000Z"));

    await notifyUser("u1", "session_goal", { title: TITLE, body: BODY });

    expect(mockRepo.insertNotification).toHaveBeenCalledWith({
      userId: "u1",
      kind: "session_goal",
      title: TITLE,
      body: BODY,
      data: undefined,
    });
    expect(mockGetPushProvider).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("sends a push outside quiet hours when a token exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T08:00:00.000Z")); // ~1:30pm IST
    mockRepo.listPushTokensForUser.mockResolvedValueOnce([{ id: "tok_1", expoPushToken: "ExponentPushToken[x]" }]);
    const mockSend = vi.fn().mockResolvedValueOnce([{ status: "sent" }]);
    mockGetPushProvider.mockReturnValueOnce({ send: mockSend });

    await notifyUser("u1", "session_goal", { title: TITLE, body: BODY }, { worldId: "w1" });

    expect(mockSend).toHaveBeenCalledWith([
      { expoPushToken: "ExponentPushToken[x]", title: "T en", body: "B en", data: { worldId: "w1" } },
    ]);
    expect(mockRepo.deletePushTokenById).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("prunes a token the provider reports as invalid, never a token that just errored transiently", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T08:00:00.000Z"));
    mockRepo.listPushTokensForUser.mockResolvedValueOnce([
      { id: "tok_invalid", expoPushToken: "ExponentPushToken[dead]" },
      { id: "tok_error", expoPushToken: "ExponentPushToken[flaky]" },
    ]);
    const mockSend = vi.fn().mockResolvedValueOnce([
      { status: "invalid_token" },
      { status: "error", message: "transient" },
    ]);
    mockGetPushProvider.mockReturnValueOnce({ send: mockSend });

    await notifyUser("u1", "boss_battle", { title: TITLE, body: BODY });

    expect(mockRepo.deletePushTokenById).toHaveBeenCalledWith("tok_invalid");
    expect(mockRepo.deletePushTokenById).not.toHaveBeenCalledWith("tok_error");

    vi.useRealTimers();
  });

  it("never throws even if the push provider itself throws", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T08:00:00.000Z"));
    mockRepo.listPushTokensForUser.mockResolvedValueOnce([{ id: "tok_1", expoPushToken: "ExponentPushToken[x]" }]);
    mockGetPushProvider.mockReturnValueOnce({ send: vi.fn().mockRejectedValueOnce(new Error("network down")) });

    await expect(notifyUser("u1", "session_goal", { title: TITLE, body: BODY })).resolves.toBeUndefined();

    vi.useRealTimers();
  });
});

describe("hasBeenNotifiedSince", () => {
  it("delegates straight to the repo", async () => {
    const since = new Date("2026-09-30T00:00:00Z");
    mockRepo.hasNotificationSince.mockResolvedValueOnce(true);

    const result = await hasBeenNotifiedSince("u1", "session_goal", since);

    expect(result).toBe(true);
    expect(mockRepo.hasNotificationSince).toHaveBeenCalledWith("u1", "session_goal", since);
  });
});
