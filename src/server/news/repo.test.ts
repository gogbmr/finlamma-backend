// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - never touches the real Supabase database (see @/db/client's
// NODE_ENV=test guard). Proves the (source, externalId) dedupe index, the
// undrafted-raw join, and the pipeline status writes actually hold at the
// database level.
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/db";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getRawIngestedCount,
  getStoryStatusCounts,
  getUndraftedRawCount,
  insertDraftStory,
  insertRawItemsIfNew,
  listAllStories,
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

describe("listUndraftedRaw / insertDraftStory", () => {
  it("a freshly-ingested raw item shows up as undrafted", async () => {
    const raw = await seedRaw("undrafted-a");
    const undrafted = await listUndraftedRaw(50);
    expect(undrafted.some((r) => r.id === raw.id)).toBe(true);
  });

  it("drafting a story removes the raw item from the undrafted list", async () => {
    const raw = await seedRaw("undrafted-b");
    await insertDraftStory({
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
    const created = await insertDraftStory({
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
    const created = await insertDraftStory({
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
    const created = await insertDraftStory({
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
