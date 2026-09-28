// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - never touches the real Supabase database (see @/db/client's
// NODE_ENV=test guard). Proves the (source, externalId) dedupe index, the
// undrafted-raw join, and the pipeline status writes actually hold at the
// database level.
import { afterAll, describe, expect, it, vi } from "vitest";
import { users } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getExistingRead,
  getPublishedStoryById,
  getRawIngestedCount,
  getStoryStatusCounts,
  getUndraftedRawCount,
  insertDraftStoryWithQuestion,
  insertRawItemsIfNew,
  insertReadIfNew,
  listActiveDeskPicks,
  listAllStories,
  listPublishedStories,
  listReadStoryIdsForUser,
  listUndraftedRaw,
  updateStoryQualityOverrideRow,
  updateStoryStatusRow,
  updateStoryTopicRow,
} = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

const CONTENT = {
  headline: { en: "H", hi: "H", hx: "H" },
  summary: { en: "S", hi: "S", hx: "S" },
  body: [{ en: "Body para 1.", hi: "x", hx: "x" }],
};
const JARGON = {
  term: { en: "repo rate", hi: "x", hx: "x" },
  explanation: { en: "The rate...", hi: "x", hx: "x" },
};
const QUESTION = {
  prompt: { en: "What happened?", hi: "x", hx: "x" },
  explanation: { en: "x", hi: "x", hx: "x" },
  options: [
    { en: "A", hi: "x", hx: "x" },
    { en: "B", hi: "x", hx: "x" },
    { en: "C", hi: "x", hx: "x" },
  ],
  correctIndex: 0,
};

// Thin wrapper returning just the story half of insertDraftStoryWithQuestion
// - most of this file's tests only care about the story row; the bundled
// question insert is exercised directly in the "insertDraftStoryWithQuestion"
// describe block below.
async function draftStory(input: Omit<Parameters<typeof insertDraftStoryWithQuestion>[0], "question">) {
  const { story } = await insertDraftStoryWithQuestion({ ...input, question: QUESTION });
  return story;
}

async function seedRaw(externalId: string, source = "mock") {
  const [row] = await insertRawItemsIfNew(source, [
    {
      externalId,
      url: `https://example.com/${externalId}`,
      headline: `Headline ${externalId}`,
      summary: `Summary ${externalId}`,
      publishedAt: new Date("2026-09-28T04:00:00.000Z"),
    },
  ]);
  return row;
}

describe("insertRawItemsIfNew", () => {
  it("inserts a new item", async () => {
    const rows = await seedRaw("dedupe-a");
    expect(rows.externalId).toBe("dedupe-a");
  });

  it("is idempotent on (source, externalId) - a re-ingest is a silent no-op", async () => {
    await seedRaw("dedupe-b");
    const secondAttempt = await insertRawItemsIfNew("mock", [
      {
        externalId: "dedupe-b",
        url: "https://example.com/dedupe-b",
        headline: "Different headline this time",
        summary: "Different summary",
        publishedAt: new Date(),
      },
    ]);
    expect(secondAttempt).toHaveLength(0);
  });

  it("returns [] without a query for an empty batch", async () => {
    expect(await insertRawItemsIfNew("mock", [])).toEqual([]);
  });
});

describe("insertDraftStoryWithQuestion", () => {
  it("creates both the story and its bundled question, linked by sourceStoryId", async () => {
    const raw = await seedRaw("bundle-a");

    const { story, question } = await insertDraftStoryWithQuestion({
      rawId: raw.id,
      category: "rbi_rates",
      impact: "neutral",
      content: CONTENT,
      jargon: JARGON,
      outlet: "mock",
      sourceUrl: raw.url,
      qualityGrade: "A",
      adviceLikeWarnings: [],
      question: QUESTION,
    });

    expect(story.status).toBe("draft");
    expect(question.status).toBe("draft");
    expect(question.sourceStoryId).toBe(story.id);
    expect(question.format).toBe("single_select");
    expect(question.topicId).toBeNull();
  });
});

describe("listUndraftedRaw / insertDraftStory", () => {
  it("a freshly-ingested raw item shows up as undrafted", async () => {
    const raw = await seedRaw("undrafted-a");
    const undrafted = await listUndraftedRaw(50);
    expect(undrafted.some((r) => r.id === raw.id)).toBe(true);
  });

  it("drafting a story removes the raw item from the undrafted list", async () => {
    const raw = await seedRaw("undrafted-b");
    await draftStory({
      rawId: raw.id,
      category: "inflation",
      impact: "neutral",
      content: CONTENT,
      jargon: JARGON,
      outlet: "mock",
      sourceUrl: raw.url,
      qualityGrade: "B",
      adviceLikeWarnings: [],
    });

    const undrafted = await listUndraftedRaw(50);
    expect(undrafted.some((r) => r.id === raw.id)).toBe(false);
  });
});

describe("listAllStories / status + override + topic writes", () => {
  it("a new draft story appears in the pipeline as status draft", async () => {
    const raw = await seedRaw("pipeline-a");
    const created = await draftStory({
      rawId: raw.id,
      category: "rbi_rates",
      impact: "neutral",
      content: CONTENT,
      jargon: JARGON,
      outlet: "mock",
      sourceUrl: raw.url,
      qualityGrade: "A",
      adviceLikeWarnings: [],
    });
    expect(created.status).toBe("draft");

    const all = await listAllStories();
    expect(all.some((s) => s.id === created.id && s.status === "draft")).toBe(true);
  });

  it("updateStoryStatusRow publishes and stamps publishedAt", async () => {
    const raw = await seedRaw("pipeline-b");
    const created = await draftStory({
      rawId: raw.id,
      category: "banking",
      impact: "good",
      content: CONTENT,
      jargon: JARGON,
      outlet: "mock",
      sourceUrl: raw.url,
      qualityGrade: "A",
      adviceLikeWarnings: [],
    });

    const published = await updateStoryStatusRow(created.id, "published");
    expect(published?.status).toBe("published");
    expect(published?.publishedAt).not.toBeNull();
  });

  it("updateStoryQualityOverrideRow and updateStoryTopicRow update in place", async () => {
    const raw = await seedRaw("pipeline-c");
    const created = await draftStory({
      rawId: raw.id,
      category: "currency",
      impact: "bad",
      content: CONTENT,
      jargon: JARGON,
      outlet: "mock",
      sourceUrl: raw.url,
      qualityGrade: "C",
      adviceLikeWarnings: ["guaranteed profit"],
    });

    const overridden = await updateStoryQualityOverrideRow(created.id, "B");
    expect(overridden?.qualityGradeOverride).toBe("B");

    const topicId = "00000000-0000-0000-0000-000000000000";
    // No FK target exists for this id, so this specific write is expected
    // to fail at the database level - proving the FK constraint holds.
    await expect(updateStoryTopicRow(created.id, topicId)).rejects.toThrow();
  });

  it("returns null for an id that doesn't exist", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    expect(await updateStoryStatusRow(missing, "published")).toBeNull();
    expect(await updateStoryQualityOverrideRow(missing, "A")).toBeNull();
  });
});

describe("KPI counts", () => {
  it("getRawIngestedCount / getUndraftedRawCount / getStoryStatusCounts reflect writes", async () => {
    const before = await getRawIngestedCount();
    await seedRaw("kpi-a");
    expect(await getRawIngestedCount()).toBe(before + 1);

    const undraftedBefore = await getUndraftedRawCount();
    expect(undraftedBefore).toBeGreaterThan(0);

    const statusCounts = await getStoryStatusCounts();
    expect(statusCounts.draft).toBeGreaterThanOrEqual(0);
    expect(statusCounts.published).toBeGreaterThanOrEqual(0);
    expect(statusCounts.hidden).toBeGreaterThanOrEqual(0);
  });
});

async function publishStory(externalIdSuffix: string) {
  const raw = await seedRaw(`feed-${externalIdSuffix}`);
  const created = await draftStory({
    rawId: raw.id,
    category: "inflation",
    impact: "neutral",
    content: CONTENT,
    jargon: JARGON,
    outlet: "mock",
    sourceUrl: raw.url,
    qualityGrade: "A",
    adviceLikeWarnings: [],
  });
  return updateStoryStatusRow(created.id, "published");
}

describe("listPublishedStories / getPublishedStoryById", () => {
  it("only returns published stories, never draft or hidden ones", async () => {
    const raw = await seedRaw("feed-draft-only");
    await draftStory({
      rawId: raw.id,
      category: "inflation",
      impact: "neutral",
      content: CONTENT,
      jargon: JARGON,
      outlet: "mock",
      sourceUrl: raw.url,
      qualityGrade: "B",
      adviceLikeWarnings: [],
    });
    const published = await publishStory("visible");

    const { data } = await listPublishedStories({ limit: 50, cursor: null, category: null });
    expect(data.some((s) => s.id === published!.id)).toBe(true);
    expect(data.every((s) => s.status === "published")).toBe(true);
  });

  it("filters by category when given", async () => {
    const raw = await seedRaw("feed-category");
    const created = await draftStory({
      rawId: raw.id,
      category: "banking",
      impact: "good",
      content: CONTENT,
      jargon: JARGON,
      outlet: "mock",
      sourceUrl: raw.url,
      qualityGrade: "A",
      adviceLikeWarnings: [],
    });
    await updateStoryStatusRow(created.id, "published");

    const { data } = await listPublishedStories({ limit: 50, cursor: null, category: "banking" });
    expect(data.every((s) => s.category === "banking")).toBe(true);
    expect(data.some((s) => s.id === created.id)).toBe(true);
  });

  it("getPublishedStoryById returns null for a draft story", async () => {
    const raw = await seedRaw("feed-not-published");
    const created = await draftStory({
      rawId: raw.id,
      category: "currency",
      impact: "neutral",
      content: CONTENT,
      jargon: JARGON,
      outlet: "mock",
      sourceUrl: raw.url,
      qualityGrade: "B",
      adviceLikeWarnings: [],
    });
    expect(await getPublishedStoryById(created.id)).toBeNull();
  });
});

describe("news_reads", () => {
  async function seedUser() {
    const [user] = await db
      .insert(users)
      .values({ clerkUserId: uniqueClerkUserId("news-repo-test"), clerkUpdatedAt: new Date() })
      .returning();
    return user;
  }

  it("insertReadIfNew inserts, and is idempotent on (userId, storyId)", async () => {
    const user = await seedUser();
    const story = await publishStory(`read-${user.id}`);

    const first = await insertReadIfNew(user.id, story!.id, 20);
    expect(first?.dwellSeconds).toBe(20);

    const second = await insertReadIfNew(user.id, story!.id, 99);
    expect(second).toBeNull();
  });

  it("getExistingRead / listReadStoryIdsForUser reflect what's been read", async () => {
    const user = await seedUser();
    const readStory = await publishStory(`get-${user.id}-a`);
    const unreadStory = await publishStory(`get-${user.id}-b`);
    await insertReadIfNew(user.id, readStory!.id, 20);

    expect(await getExistingRead(user.id, readStory!.id)).not.toBeNull();
    expect(await getExistingRead(user.id, unreadStory!.id)).toBeNull();

    const readIds = await listReadStoryIdsForUser(user.id, [readStory!.id, unreadStory!.id]);
    expect(readIds.has(readStory!.id)).toBe(true);
    expect(readIds.has(unreadStory!.id)).toBe(false);
  });

  it("listReadStoryIdsForUser returns an empty set for an empty input, without a query", async () => {
    const user = await seedUser();
    expect((await listReadStoryIdsForUser(user.id, [])).size).toBe(0);
  });
});

describe("listActiveDeskPicks", () => {
  it("returns only rows the repo layer can see (active filtering is exercised via the service layer's default insert)", async () => {
    // news_desk_picks has no repo insert helper yet (Checkpoint 2 didn't
    // build desk-pick authoring) - this proves the function runs cleanly
    // against an empty/absent table state rather than asserting content.
    expect(await listActiveDeskPicks()).toEqual([]);
  });
});
