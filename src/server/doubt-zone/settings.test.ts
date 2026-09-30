import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSettingJson = vi.fn();
const mockSetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingJson: (key: unknown) => mockGetSettingJson(key),
  setSettingJson: (key: unknown, value: unknown, description?: unknown) =>
    mockSetSettingJson(key, value, description),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import { getDoubtZoneSafetySettings, updateDoubtZoneSafetySettings } from "./settings";
import { DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS, DOUBT_ZONE_SAFETY_SETTINGS_KEY } from "./schemas";

const ACTOR = { id: "staff_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDoubtZoneSafetySettings", () => {
  it("returns the stored value when it matches the current shape", async () => {
    const custom = { ...DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS, perLearnerDailyMessageCap: 10 };
    mockGetSettingJson.mockResolvedValueOnce(custom);

    const result = await getDoubtZoneSafetySettings();

    expect(result).toEqual(custom);
  });

  it("falls back to defaults when nothing is seeded yet", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);

    const result = await getDoubtZoneSafetySettings();

    expect(result).toEqual(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS);
  });

  it("falls back to defaults (never disabling the safety redirect) when the stored value doesn't match the schema", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ garbage: true });

    const result = await getDoubtZoneSafetySettings();

    expect(result).toEqual(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS);
  });
});

describe("updateDoubtZoneSafetySettings", () => {
  it("writes the new value and logs the change with before/after", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS);
    const next = { ...DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS, flagOnAnySignal: false };

    const result = await updateDoubtZoneSafetySettings(ACTOR, next, META);

    expect(result).toEqual(next);
    expect(mockSetSettingJson).toHaveBeenCalledWith(DOUBT_ZONE_SAFETY_SETTINGS_KEY, next, expect.any(String));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "staff",
        actorId: "staff_1",
        action: "settings.doubt_zone_safety_updated",
        targetType: "settings_kv",
        targetId: DOUBT_ZONE_SAFETY_SETTINGS_KEY,
        metadata: { previous: DEFAULT_DOUBT_ZONE_SAFETY_SETTINGS, next },
        ip: "1.2.3.4",
        userAgent: "test-agent",
      }),
    );
  });
});
