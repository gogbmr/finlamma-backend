import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSettingJson = vi.fn();
const mockSetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingJson: (key: unknown) => mockGetSettingJson(key),
  setSettingJson: (key: unknown, value: unknown, description?: unknown) =>
    mockSetSettingJson(key, value, description),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({ logActivity: (input: unknown) => mockLogActivity(input) }));

const { getNotificationsSettings, updateNotificationsSettings } = await import("./settings");
const { DEFAULT_NOTIFICATIONS_SETTINGS, NOTIFICATIONS_SETTINGS_KEY } = await import("./schemas");

const ACTOR = { id: "staff_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getNotificationsSettings", () => {
  it("falls back to defaults when nothing is seeded", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);

    expect(await getNotificationsSettings()).toEqual(DEFAULT_NOTIFICATIONS_SETTINGS);
  });

  it("falls back to defaults when the stored value doesn't match the schema", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ garbage: true });

    expect(await getNotificationsSettings()).toEqual(DEFAULT_NOTIFICATIONS_SETTINGS);
  });

  it("returns a valid stored value", async () => {
    const custom = { defaultQuietHours: { startHourIst: 22, endHourIst: 6 }, retentionDays: 14 };
    mockGetSettingJson.mockResolvedValueOnce(custom);

    expect(await getNotificationsSettings()).toEqual(custom);
  });
});

describe("updateNotificationsSettings", () => {
  it("writes and logs the change", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_NOTIFICATIONS_SETTINGS);
    const next = { ...DEFAULT_NOTIFICATIONS_SETTINGS, retentionDays: 14 };

    const result = await updateNotificationsSettings(ACTOR, next, META);

    expect(result).toEqual(next);
    expect(mockSetSettingJson).toHaveBeenCalledWith(NOTIFICATIONS_SETTINGS_KEY, next, expect.any(String));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings.notifications_updated", targetId: NOTIFICATIONS_SETTINGS_KEY }),
    );
  });
});
