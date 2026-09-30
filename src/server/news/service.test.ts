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

const mockGetExistingRead = vi.fn();
const mockGetPublishedStoryById = vi.fn();
const mockGetRawIngestedCount = vi.fn();
const mockGetStoryById = vi.fn();
const mockGetStoryStatusCounts = vi.fn();
const mockGetUndraftedRawCount = vi.fn();
const mockInsertDraftStoryWithQuestion = vi.fn();
const mockInsertRawItemsIfNew = vi.fn();
const mockInsertReadIfNew = vi.fn();
const mockListActiveDeskPicks = vi.fn();
const mockListAllStories = vi.fn();
const mockListPublishedStories = vi.fn();
const mockListPublishedStoriesPendingNotification = vi.fn();
const mockListReadStoryIdsForUser = vi.fn();
const mockListRecentlyEngagedNewsReaderIds = vi.fn();
const mockListRecentNewsEvents = vi.fn();
const mockListUndraftedRaw = vi.fn();
const mockMarkStoryNotified = vi.fn();
const mockUpdateStoryQualityOverrideRow = vi.fn();
const mockUpdateStoryStatusRow = vi.fn();
const mockUpdateStoryTopicRow = vi.fn();
vi.mock("./repo", () => ({
  getExistingRead: (userId: unknown, storyId: unknown) => mockGetExistingRead(userId, storyId),
  getPublishedStoryById: (id: unknown) => mockGetPublishedStoryById(id),
  getRawIngestedCount: () => mockGetRawIngestedCount(),
  getStoryById: (id: unknown) => mockGetStoryById(id),
  getStoryStatusCounts: () => mockGetStoryStatusCounts(),
  getUndraftedRawCount: () => mockGetUndraftedRawCount(),
  insertDraftStoryWithQuestion: (input: unknown) => mockInsertDraftStoryWithQuestion(input),
  insertRawItemsIfNew: (source: unknown, items: unknown) => mockInsertRawItemsIfNew(source, items),
  insertReadIfNew: (userId: unknown, storyId: unknown, dwell: unknown) =>
    mockInsertReadIfNew(userId, storyId, dwell),
  listActiveDeskPicks: () => mockListActiveDeskPicks(),
  listAllStories: () => mockListAllStories(),
  listPublishedStories: (opts: unknown) => mockListPublishedStories(opts),
  listPublishedStoriesPendingNotification: (limit: unknown) => mockListPublishedStoriesPendingNotification(limit),
  listReadStoryIdsForUser: (userId: unknown, ids: unknown) => mockListReadStoryIdsForUser(userId, ids),
  listRecentlyEngagedNewsReaderIds: (since: unknown) => mockListRecentlyEngagedNewsReaderIds(since),
  listRecentNewsEvents: (limit: unknown) => mockListRecentNewsEvents(limit),
  listUndraftedRaw: (limit: unknown) => mockListUndraftedRaw(limit),
  markStoryNotified: (id: unknown) => mockMarkStoryNotified(id),
  updateStoryQualityOverrideRow: (id: unknown, v: unknown) => mockUpdateStoryQualityOverrideRow(id, v),
  updateStoryStatusRow: (id: unknown, v: unknown) => mockUpdateStoryStatusRow(id, v),
  updateStoryTopicRow: (id: unknown, v: unknown) => mockUpdateStoryTopicRow(id, v),
}));

const mockNotifyUser = vi.fn();
vi.mock("@/server/notifications/service", () => ({
  notifyUser: (...args: unknown[]) => mockNotifyUser(...args),
}));

import {
  broadcastPendingNewsNotifications,
  draftPendingStories,
  getNewsDeskPicksForApp,
  getNewsFeed,
  getNewsKpisForAdmin,
  getNewsQuizGeneratorSettings,
  getNewsStoryDetail,
  ingestLatestNews,
  markNewsStoryRead,
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
  question: {
    prompt: { en: "What did the RBI do?", hi: "x", hx: "x" },
    options: [
      { en: "Held the rate", hi: "x", hx: "x" },
      { en: "Raised the rate", hi: "x", hx: "x" },
      { en: "Cut the rate", hi: "x", hx: "x" },
    ],
    correctIndex: 0,
    explanation: { en: "The RBI held rates steady.", hi: "x", hx: "x" },
  },
};

describe("draftPendingStories", () => {
  it("drafts every pending raw item, quality-grading and advice-checking each one", async () => {
    mockListUndraftedRaw.mockResolvedValueOnce([RAW_ITEM]);
    mockDraftNewsStoryFromRaw.mockResolvedValueOnce(DRAFT_OUTPUT);
    mockInsertDraftStoryWithQuestion.mockResolvedValueOnce({ story: { id: "story_1" }, question: { id: "q_1" } });

    const result = await draftPendingStories(10);

    expect(result).toEqual({ drafted: 1, failed: 0 });
    expect(mockInsertDraftStoryWithQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        rawId: "raw_1",
        category: "rbi_rates",
        outlet: "mock",
        qualityGrade: "A", // 2 paragraphs, has jargon, long-enough summary, no advice warnings
        adviceLikeWarnings: [],
        question: DRAFT_OUTPUT.question,
      }),
    );
  });

  it("one item's AI failure is logged and skipped - never blocks the rest of the batch", async () => {
    mockListUndraftedRaw.mockResolvedValueOnce([RAW_ITEM, { ...RAW_ITEM, id: "raw_2", externalId: "b" }]);
    mockDraftNewsStoryFromRaw.mockRejectedValueOnce(new Error("model refused"));
    mockDraftNewsStoryFromRaw.mockResolvedValueOnce(DRAFT_OUTPUT);
    mockInsertDraftStoryWithQuestion.mockResolvedValueOnce({ story: { id: "story_2" }, question: { id: "q_2" } });

    const result = await draftPendingStories(10);

    expect(result).toEqual({ drafted: 1, failed: 1 });
    expect(mockLogInternalError).toHaveBeenCalledWith("news.draft_failed", expect.any(Error));
  });

  it("caps the quality grade at C when an advice-like phrase is found", async () => {
    mockListUndraftedRaw.mockResolvedValueOnce([RAW_ITEM]);
    mockDraftNewsStoryFromRaw.mockResolvedValueOnce(DRAFT_OUTPUT);
    mockFindAdviceLikePhrases.mockReturnValueOnce(["guaranteed profit"]);
    mockInsertDraftStoryWithQuestion.mockResolvedValueOnce({ story: { id: "story_1" }, question: { id: "q_1" } });

    await draftPendingStories(10);

    expect(mockInsertDraftStoryWithQuestion).toHaveBeenCalledWith(
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

const PUBLISHED_STORY = {
  id: "story_1",
  content: {
    headline: { en: "H", hi: "H", hx: "H" },
    summary: { en: "S", hi: "S", hx: "S" },
    body: [{ en: "word ".repeat(40), hi: "x", hx: "x" }], // 40 words -> 20s min read
  },
  jargon: { term: { en: "repo rate", hi: "x", hx: "x" }, explanation: { en: "x", hi: "x", hx: "x" } },
  category: "rbi_rates",
  impact: "neutral",
  outlet: "mock",
  sourceUrl: "https://example.com/a",
  featured: false,
  publishedAt: new Date("2026-09-28T04:00:00.000Z"),
  createdAt: new Date("2026-09-28T03:00:00.000Z"),
};

describe("getNewsFeed", () => {
  it("marks read stories from listReadStoryIdsForUser and shapes each preview", async () => {
    mockListPublishedStories.mockResolvedValueOnce({ data: [PUBLISHED_STORY], nextCursor: null });
    mockListReadStoryIdsForUser.mockResolvedValueOnce(new Set(["story_1"]));

    const result = await getNewsFeed("user_1", { limit: 20, cursor: null, category: null });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: "story_1", category: "rbi_rates", read: true });
    expect(result.nextCursor).toBeNull();
  });

  it("a story not in the read set shows read: false", async () => {
    mockListPublishedStories.mockResolvedValueOnce({ data: [PUBLISHED_STORY], nextCursor: null });
    mockListReadStoryIdsForUser.mockResolvedValueOnce(new Set());

    const result = await getNewsFeed("user_1", { limit: 20, cursor: null, category: null });

    expect(result.data[0].read).toBe(false);
  });
});

describe("getNewsStoryDetail", () => {
  it("returns full detail including a computed minReadSeconds", async () => {
    mockGetPublishedStoryById.mockResolvedValueOnce(PUBLISHED_STORY);
    mockGetExistingRead.mockResolvedValueOnce(null);

    const result = await getNewsStoryDetail("user_1", "story_1");

    expect(result.minReadSeconds).toBe(20);
    expect(result.read).toBe(false);
  });

  it("throws NOT_FOUND for a draft/hidden/nonexistent story", async () => {
    mockGetPublishedStoryById.mockResolvedValueOnce(null);

    await expect(getNewsStoryDetail("user_1", "nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("markNewsStoryRead", () => {
  it("rejects with NEWS_READ_TOO_SOON when dwellSeconds is below the computed minimum", async () => {
    mockGetPublishedStoryById.mockResolvedValueOnce(PUBLISHED_STORY);
    mockGetExistingRead.mockResolvedValueOnce(null);

    await expect(markNewsStoryRead({ id: "user_1" }, "story_1", 5, META)).rejects.toMatchObject({
      code: "NEWS_READ_TOO_SOON",
    });
    expect(mockInsertReadIfNew).not.toHaveBeenCalled();
  });

  it("records the read and logs it when dwellSeconds meets the minimum", async () => {
    mockGetPublishedStoryById.mockResolvedValueOnce(PUBLISHED_STORY);
    mockGetExistingRead.mockResolvedValueOnce(null);
    mockInsertReadIfNew.mockResolvedValueOnce({ id: "read_1" });

    const result = await markNewsStoryRead({ id: "user_1" }, "story_1", 20, META);

    expect(result).toEqual({ read: true, alreadyRead: false });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "news.story_read", metadata: { dwellSeconds: 20 } }),
    );
  });

  it("is idempotent - a repeat call for an already-read story returns alreadyRead: true, no new log", async () => {
    mockGetPublishedStoryById.mockResolvedValueOnce(PUBLISHED_STORY);
    mockGetExistingRead.mockResolvedValueOnce({ id: "read_1" });

    const result = await markNewsStoryRead({ id: "user_1" }, "story_1", 20, META);

    expect(result).toEqual({ read: true, alreadyRead: true });
    expect(mockInsertReadIfNew).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a story that isn't published", async () => {
    mockGetPublishedStoryById.mockResolvedValueOnce(null);

    await expect(markNewsStoryRead({ id: "user_1" }, "nope", 20, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("getNewsDeskPicksForApp", () => {
  it("passes through to the repo", async () => {
    mockListActiveDeskPicks.mockResolvedValueOnce([{ id: "pick_1" }]);

    expect(await getNewsDeskPicksForApp()).toHaveLength(1);
  });
});

describe("broadcastPendingNewsNotifications", () => {
  const STORY = {
    id: "story_1",
    content: {
      headline: { en: "H", hi: "H", hx: "H" },
      summary: { en: "S", hi: "S", hx: "S" },
    },
  };

  it("does nothing (never queries readers) when no story is pending", async () => {
    mockListPublishedStoriesPendingNotification.mockResolvedValueOnce([]);

    const result = await broadcastPendingNewsNotifications({ storyLimit: 5, engagementWindowDays: 30 });

    expect(mockListRecentlyEngagedNewsReaderIds).not.toHaveBeenCalled();
    expect(result).toEqual({ storiesNotified: 0, pushesSent: 0 });
  });

  it("notifies every engaged reader with the story's own headline/summary as title/body, then marks it notified", async () => {
    mockListPublishedStoriesPendingNotification.mockResolvedValueOnce([STORY]);
    mockListRecentlyEngagedNewsReaderIds.mockResolvedValueOnce(["u1", "u2"]);

    const result = await broadcastPendingNewsNotifications({ storyLimit: 5, engagementWindowDays: 30 });

    expect(mockNotifyUser).toHaveBeenCalledWith(
      "u1",
      "market_news",
      { title: STORY.content.headline, body: STORY.content.summary },
      { newsStoryId: "story_1" },
    );
    expect(mockNotifyUser).toHaveBeenCalledWith(
      "u2",
      "market_news",
      { title: STORY.content.headline, body: STORY.content.summary },
      { newsStoryId: "story_1" },
    );
    expect(mockMarkStoryNotified).toHaveBeenCalledWith("story_1");
    expect(result).toEqual({ storiesNotified: 1, pushesSent: 2 });
  });

  it("still marks a story notified even with zero engaged readers", async () => {
    mockListPublishedStoriesPendingNotification.mockResolvedValueOnce([STORY]);
    mockListRecentlyEngagedNewsReaderIds.mockResolvedValueOnce([]);

    const result = await broadcastPendingNewsNotifications({ storyLimit: 5, engagementWindowDays: 30 });

    expect(mockNotifyUser).not.toHaveBeenCalled();
    expect(mockMarkStoryNotified).toHaveBeenCalledWith("story_1");
    expect(result).toEqual({ storiesNotified: 1, pushesSent: 0 });
  });
});
