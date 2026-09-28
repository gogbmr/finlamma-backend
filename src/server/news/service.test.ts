import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockLogInternalError = vi.fn();
vi.mock("@/lib/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http")>()),
  logInternalError: (id: unknown, err: unknown) => mockLogInternalError(id, err),
}));

const mockGetSettingJson = vi.fn();
const mockSetSettingJson = vi.fn();
vi.mock("@/lib/settings", () => ({
  getSettingJson: (key: unknown) => mockGetSettingJson(key),
  setSettingJson: (key: unknown, value: unknown, description?: unknown) =>
    mockSetSettingJson(key, value, description),
}));

const mockFindAdviceLikePhrases = vi.fn();
vi.mock("@/server/trading/advice-language", () => ({
  findAdviceLikePhrases: (text: unknown) => mockFindAdviceLikePhrases(text),
}));

const mockDraftNewsStoryFromRaw = vi.fn();
vi.mock("./ai", () => ({
  draftNewsStoryFromRaw: (raw: unknown) => mockDraftNewsStoryFromRaw(raw),
}));

const mockFetchLatest = vi.fn();
const mockGetNewsProvider = vi.fn();
vi.mock("./providers", () => ({
  getNewsProvider: () => mockGetNewsProvider(),
}));

const mockGetRawIngestedCount = vi.fn();
const mockGetStoryById = vi.fn();
const mockGetStoryStatusCounts = vi.fn();
const mockGetUndraftedRawCount = vi.fn();
const mockInsertDraftStory = vi.fn();
const mockInsertRawItemsIfNew = vi.fn();
const mockListAllStories = vi.fn();
const mockListRecentNewsEvents = vi.fn();
const mockListUndraftedRaw = vi.fn();
const mockUpdateStoryQualityOverrideRow = vi.fn();
const mockUpdateStoryStatusRow = vi.fn();
const mockUpdateStoryTopicRow = vi.fn();
vi.mock("./repo", () => ({
  getRawIngestedCount: () => mockGetRawIngestedCount(),
  getStoryById: (id: unknown) => mockGetStoryById(id),
  getStoryStatusCounts: () => mockGetStoryStatusCounts(),
  getUndraftedRawCount: () => mockGetUndraftedRawCount(),
  insertDraftStory: (input: unknown) => mockInsertDraftStory(input),
  insertRawItemsIfNew: (source: unknown, items: unknown) => mockInsertRawItemsIfNew(source, items),
  listAllStories: () => mockListAllStories(),
  listRecentNewsEvents: (limit: unknown) => mockListRecentNewsEvents(limit),
  listUndraftedRaw: (limit: unknown) => mockListUndraftedRaw(limit),
  updateStoryQualityOverrideRow: (id: unknown, v: unknown) => mockUpdateStoryQualityOverrideRow(id, v),
  updateStoryStatusRow: (id: unknown, v: unknown) => mockUpdateStoryStatusRow(id, v),
  updateStoryTopicRow: (id: unknown, v: unknown) => mockUpdateStoryTopicRow(id, v),
}));

import {
  draftPendingStories,
  getNewsKpisForAdmin,
  getNewsQuizGeneratorSettings,
  ingestLatestNews,
  updateNewsQuizGeneratorSettings,
  updateNewsStoryStatusForAdmin,
} from "./service";
import { DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS } from "./schemas";

const ACTOR = { id: "staff_1" };
const META = { ip: "1.2.3.4", userAgent: "test-agent" };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindAdviceLikePhrases.mockReturnValue([]);
});

describe("ingestLatestNews", () => {
  it("pulls from the configured provider and inserts dedup'd", async () => {
    mockGetNewsProvider.mockReturnValue({ fetchLatest: mockFetchLatest });
    mockFetchLatest.mockResolvedValueOnce([{ externalId: "a" }]);
    mockInsertRawItemsIfNew.mockResolvedValueOnce([{ id: "raw_1" }]);

    const result = await ingestLatestNews();

    expect(result).toEqual({ inserted: 1 });
    expect(mockInsertRawItemsIfNew).toHaveBeenCalledWith("mock", [{ externalId: "a" }]);
  });
});

const RAW_ITEM = {
  id: "raw_1",
  source: "mock",
  externalId: "a",
  url: "https://example.com/a",
  headline: "H",
  summary: "S",
};

const DRAFT_OUTPUT = {
  content: {
    headline: { en: "H", hi: "H", hx: "H" },
    summary: {
      en: "This is a longer summary with well over fifteen separate words in it, on purpose, for the A-grade test case.",
      hi: "S",
      hx: "S",
    },
    body: [
      { en: "Para 1.", hi: "x", hx: "x" },
      { en: "Para 2.", hi: "x", hx: "x" },
    ],
  },
  jargon: { term: { en: "repo rate", hi: "x", hx: "x" }, explanation: { en: "x", hi: "x", hx: "x" } },
  category: "rbi_rates",
  impact: "neutral",
};

describe("draftPendingStories", () => {
  it("drafts every pending raw item, quality-grading and advice-checking each one", async () => {
    mockListUndraftedRaw.mockResolvedValueOnce([RAW_ITEM]);
    mockDraftNewsStoryFromRaw.mockResolvedValueOnce(DRAFT_OUTPUT);
    mockInsertDraftStory.mockResolvedValueOnce({ id: "story_1" });

    const result = await draftPendingStories(10);

    expect(result).toEqual({ drafted: 1, failed: 0 });
    expect(mockInsertDraftStory).toHaveBeenCalledWith(
      expect.objectContaining({
        rawId: "raw_1",
        category: "rbi_rates",
        outlet: "mock",
        qualityGrade: "A", // 2 paragraphs, has jargon, long-enough summary, no advice warnings
        adviceLikeWarnings: [],
      }),
    );
  });

  it("one item's AI failure is logged and skipped - never blocks the rest of the batch", async () => {
    mockListUndraftedRaw.mockResolvedValueOnce([RAW_ITEM, { ...RAW_ITEM, id: "raw_2", externalId: "b" }]);
    mockDraftNewsStoryFromRaw.mockRejectedValueOnce(new Error("model refused"));
    mockDraftNewsStoryFromRaw.mockResolvedValueOnce(DRAFT_OUTPUT);
    mockInsertDraftStory.mockResolvedValueOnce({ id: "story_2" });

    const result = await draftPendingStories(10);

    expect(result).toEqual({ drafted: 1, failed: 1 });
    expect(mockLogInternalError).toHaveBeenCalledWith("news.draft_failed", expect.any(Error));
  });

  it("caps the quality grade at C when an advice-like phrase is found", async () => {
    mockListUndraftedRaw.mockResolvedValueOnce([RAW_ITEM]);
    mockDraftNewsStoryFromRaw.mockResolvedValueOnce(DRAFT_OUTPUT);
    mockFindAdviceLikePhrases.mockReturnValueOnce(["guaranteed profit"]);
    mockInsertDraftStory.mockResolvedValueOnce({ id: "story_1" });

    await draftPendingStories(10);

    expect(mockInsertDraftStory).toHaveBeenCalledWith(
      expect.objectContaining({ qualityGrade: "C", adviceLikeWarnings: ["guaranteed profit"] }),
    );
  });
});

describe("getNewsKpisForAdmin", () => {
  it("combines status counts with ingested/undrafted totals", async () => {
    mockGetStoryStatusCounts.mockResolvedValueOnce({ draft: 2, published: 3, hidden: 1 });
    mockGetRawIngestedCount.mockResolvedValueOnce(10);
    mockGetUndraftedRawCount.mockResolvedValueOnce(4);

    const kpis = await getNewsKpisForAdmin();

    expect(kpis).toEqual({
      ingestedCount: 10,
      undraftedCount: 4,
      draftCount: 2,
      publishedCount: 3,
      hiddenCount: 1,
    });
  });
});

describe("updateNewsStoryStatusForAdmin", () => {
  it("updates and logs previous/next status", async () => {
    mockGetStoryById.mockResolvedValueOnce({ id: "story_1", status: "draft" });
    mockUpdateStoryStatusRow.mockResolvedValueOnce({ id: "story_1", status: "published" });

    const result = await updateNewsStoryStatusForAdmin(ACTOR, "story_1", "published", META);

    expect(result.status).toBe("published");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "news.story_status_updated",
        metadata: { previous: "draft", next: "published" },
      }),
    );
  });

  it("throws NOT_FOUND when the story doesn't exist", async () => {
    mockGetStoryById.mockResolvedValueOnce(null);

    await expect(updateNewsStoryStatusForAdmin(ACTOR, "nope", "published", META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockUpdateStoryStatusRow).not.toHaveBeenCalled();
  });
});

describe("news quiz generator settings", () => {
  it("getNewsQuizGeneratorSettings falls back to defaults when unset", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);

    expect(await getNewsQuizGeneratorSettings()).toEqual(DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS);
  });

  it("updateNewsQuizGeneratorSettings persists and logs previous/next", async () => {
    mockGetSettingJson.mockResolvedValueOnce(null);
    const next = { ...DEFAULT_NEWS_QUIZ_GENERATOR_SETTINGS, questionCount: 12 };

    const result = await updateNewsQuizGeneratorSettings(ACTOR, next, META);

    expect(result).toEqual(next);
    expect(mockSetSettingJson).toHaveBeenCalledWith("news_quiz_generator", next, expect.any(String));
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "news.quiz_generator_settings_updated" }),
    );
  });
});
