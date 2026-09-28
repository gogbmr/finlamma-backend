import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireStaff = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireStaff: (permission: unknown) => mockRequireStaff(permission),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (path: unknown) => mockRevalidatePath(path),
}));

const mockUpdateNewsStoryStatusForAdmin = vi.fn();
const mockUpdateNewsStoryQualityOverrideForAdmin = vi.fn();
const mockUpdateNewsStoryTopicForAdmin = vi.fn();
const mockUpdateNewsQuizGeneratorSettings = vi.fn();
vi.mock("@/server/news/service", () => ({
  updateNewsStoryStatusForAdmin: (actor: unknown, id: unknown, status: unknown, meta: unknown) =>
    mockUpdateNewsStoryStatusForAdmin(actor, id, status, meta),
  updateNewsStoryQualityOverrideForAdmin: (actor: unknown, id: unknown, v: unknown, meta: unknown) =>
    mockUpdateNewsStoryQualityOverrideForAdmin(actor, id, v, meta),
  updateNewsStoryTopicForAdmin: (actor: unknown, id: unknown, v: unknown, meta: unknown) =>
    mockUpdateNewsStoryTopicForAdmin(actor, id, v, meta),
  updateNewsQuizGeneratorSettings: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateNewsQuizGeneratorSettings(actor, input, meta),
}));

import {
  updateNewsQuizGeneratorSettingsAction,
  updateNewsStoryQualityOverrideAction,
  updateNewsStoryStatusAction,
  updateNewsStoryTopicAction,
} from "./actions";
import { DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS } from "@/server/news/schemas";

const ACTOR = { id: "staff_1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("updateNewsStoryStatusAction: requires news.publish", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: news.publish"));

    const result = await updateNewsStoryStatusAction("story_1", "published");

    expect(result).toEqual({ ok: false, error: "Missing permission: news.publish" });
    expect(mockRequireStaff).toHaveBeenCalledWith("news.publish");
    expect(mockUpdateNewsStoryStatusForAdmin).not.toHaveBeenCalled();
  });

  it("updateNewsStoryQualityOverrideAction: requires news.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: news.manage"));

    const result = await updateNewsStoryQualityOverrideAction("story_1", "A");

    expect(result).toEqual({ ok: false, error: "Missing permission: news.manage" });
    expect(mockUpdateNewsStoryQualityOverrideForAdmin).not.toHaveBeenCalled();
  });

  it("updateNewsStoryTopicAction: requires news.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: news.manage"));

    const result = await updateNewsStoryTopicAction("story_1", "topic_1");

    expect(result).toEqual({ ok: false, error: "Missing permission: news.manage" });
    expect(mockUpdateNewsStoryTopicForAdmin).not.toHaveBeenCalled();
  });

  it("updateNewsQuizGeneratorSettingsAction: requires settings.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: settings.manage"));

    const result = await updateNewsQuizGeneratorSettingsAction(DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS);

    expect(result).toEqual({ ok: false, error: "Missing permission: settings.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("settings.manage");
    expect(mockUpdateNewsQuizGeneratorSettings).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("updateNewsStoryStatusAction updates and revalidates", async () => {
    mockUpdateNewsStoryStatusForAdmin.mockResolvedValueOnce({ id: "story_1", status: "published" });

    const result = await updateNewsStoryStatusAction("story_1", "published");

    expect(result).toEqual({ ok: true });
    expect(mockUpdateNewsStoryStatusForAdmin).toHaveBeenCalledWith(
      ACTOR,
      "story_1",
      "published",
      expect.any(Object),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/news");
  });

  it("updateNewsStoryStatusAction rejects an invalid status without calling the service", async () => {
    const result = await updateNewsStoryStatusAction("story_1", "not_a_status");

    expect(result.ok).toBe(false);
    expect(mockUpdateNewsStoryStatusForAdmin).not.toHaveBeenCalled();
  });

  it("updateNewsStoryQualityOverrideAction accepts null (clearing the override)", async () => {
    mockUpdateNewsStoryQualityOverrideForAdmin.mockResolvedValueOnce({
      id: "story_1",
      qualityGradeOverride: null,
    });

    const result = await updateNewsStoryQualityOverrideAction("story_1", null);

    expect(result).toEqual({ ok: true });
    expect(mockUpdateNewsStoryQualityOverrideForAdmin).toHaveBeenCalledWith(
      ACTOR,
      "story_1",
      null,
      expect.any(Object),
    );
  });

  it("updateNewsStoryTopicAction accepts null (clearing the topic)", async () => {
    mockUpdateNewsStoryTopicForAdmin.mockResolvedValueOnce({ id: "story_1", topicId: null });

    const result = await updateNewsStoryTopicAction("story_1", null);

    expect(result).toEqual({ ok: true });
    expect(mockUpdateNewsStoryTopicForAdmin).toHaveBeenCalledWith(ACTOR, "story_1", null, expect.any(Object));
  });

  it("updateNewsQuizGeneratorSettingsAction updates and revalidates", async () => {
    mockUpdateNewsQuizGeneratorSettings.mockResolvedValueOnce(DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS);

    const result = await updateNewsQuizGeneratorSettingsAction(DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS);

    expect(result).toEqual({ ok: true });
    expect(mockUpdateNewsQuizGeneratorSettings).toHaveBeenCalledWith(
      ACTOR,
      DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS,
      expect.any(Object),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/news");
  });

  it("updateNewsQuizGeneratorSettingsAction rejects an invalid shape without calling the service", async () => {
    const result = await updateNewsQuizGeneratorSettingsAction({
      ...DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS,
      questionCount: 999,
    });

    expect(result.ok).toBe(false);
    expect(mockUpdateNewsQuizGeneratorSettings).not.toHaveBeenCalled();
  });
});
