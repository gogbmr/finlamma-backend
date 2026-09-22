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

import { getLessonFlowScoringSettings, updateLessonFlowScoringSettings } from "./service";
import { DEFAULT_LESSON_FLOW_SCORING, LESSON_FLOW_SCORING_SETTINGS_KEY } from "./schemas";

const ACTOR = { id: "staff_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLessonFlowScoringSettings", () => {
  it("returns the stored value when it matches the current shape", async () => {
    const custom = { ...DEFAULT_LESSON_FLOW_SCORING, speedBonusXp: 999 };
    mockGetSettingJson.mockResolvedValueOnce(custom);

    const result = await getLessonFlowScoringSettings();

    expect(result).toEqual(custom);
  });

  it("falls back to defaults when nothing is seeded yet", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);

    const result = await getLessonFlowScoringSettings();

    expect(result).toEqual(DEFAULT_LESSON_FLOW_SCORING);
  });

  it("falls back to defaults when the stored value no longer matches the shape (never hard-fails scoring)", async () => {
    mockGetSettingJson.mockResolvedValueOnce({ garbage: true });

    const result = await getLessonFlowScoringSettings();

    expect(result).toEqual(DEFAULT_LESSON_FLOW_SCORING);
  });
});

describe("updateLessonFlowScoringSettings", () => {
  it("writes the new value and logs the change with before/after", async () => {
    mockGetSettingJson.mockResolvedValueOnce(DEFAULT_LESSON_FLOW_SCORING);
    const next = { ...DEFAULT_LESSON_FLOW_SCORING, speedBonusXp: 25 };

    const result = await updateLessonFlowScoringSettings(ACTOR, next, META);

    expect(result).toEqual(next);
    expect(mockSetSettingJson).toHaveBeenCalledWith(
      LESSON_FLOW_SCORING_SETTINGS_KEY,
      next,
      expect.any(String),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "staff",
        actorId: "staff_1",
        action: "settings.lesson_flow_scoring_updated",
        metadata: { previous: DEFAULT_LESSON_FLOW_SCORING, next },
      }),
    );
  });
});
