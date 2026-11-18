// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real DB query (sort whitelist, ILIKE escaping,
// filters, page math) actually behaves correctly, not just that it
// compiles. Never touches the real Supabase database (see @/db/client's
// NODE_ENV=test guard).
import { afterAll, describe, expect, it, vi } from "vitest";
import { topics } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { listNewsStoriesForAdmin } = await import("./admin-queries");
const { insertDraftStoryWithQuestion, insertRawItemsIfNew, updateStoryStatusRow, updateStoryTopicRow } =
  await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

const [topicA] = await db
  .insert(topics)
  .values({ order: 1, name: { en: "Topic A", hi: "x", hx: "x" } })
  .returning();
const [topicB] = await db
  .insert(topics)
  .values({ order: 2, name: { en: "Topic B", hi: "x", hx: "x" } })
  .returning();

let rawCounter = 0;

async function draftStory(overrides: {
  headlineEn: string;
  headlineHi?: string;
  headlineHx?: string;
  category?: "rbi_rates" | "inflation" | "stock_market_basics";
  topicId?: string | null;
}) {
  rawCounter += 1;
  const externalId = `admin-queries-test-${rawCounter}`;
  const [raw] = await insertRawItemsIfNew("mock", [
    {
      externalId,
      url: `https://example.com/${externalId}`,
      headline: overrides.headlineEn,
      summary: "Summary",
      publishedAt: new Date("2026-09-28T04:00:00.000Z"),
    },
  ]);
  const { story } = await insertDraftStoryWithQuestion({
    rawId: raw!.id,
    category: overrides.category ?? "rbi_rates",
    impact: "neutral",
    content: {
      headline: {
        en: overrides.headlineEn,
        hi: overrides.headlineHi ?? "x",
        hx: overrides.headlineHx ?? "x",
      },
      summary: { en: "x", hi: "x", hx: "x" },
      body: [{ en: "x", hi: "x", hx: "x" }],
    },
    jargon: { term: { en: "x", hi: "x", hx: "x" }, explanation: { en: "x", hi: "x", hx: "x" } },
    outlet: "Test Outlet",
    sourceUrl: `https://example.com/${externalId}`,
    qualityGrade: "A",
    adviceLikeWarnings: [],
    question: {
      prompt: { en: "x", hi: "x", hx: "x" },
      explanation: { en: "x", hi: "x", hx: "x" },
      options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }],
      correctIndex: 0,
    },
  });
  if (overrides.topicId !== undefined) {
    await updateStoryTopicRow(story.id, overrides.topicId);
  }
  return story;
}

const defaultParams = {
  page: 1,
  pageSize: 20,
  sort: "createdAt" as const,
  dir: "asc" as const,
  q: "",
  status: null,
  topicId: null,
  category: null,
};

describe("listNewsStoriesForAdmin", () => {
  it("escapes % and _ so a literal underscore search doesn't act as a wildcard", async () => {
    const literal = await draftStory({ headlineEn: "escape-test headline a_b works" });
    const wildcardMatch = await draftStory({ headlineEn: "escape-test headline aXb works" });

    const result = await listNewsStoriesForAdmin({ ...defaultParams, q: "escape-test headline a_b" });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(literal.id);
    expect(ids).not.toContain(wildcardMatch.id);
  });

  it("escapes % so a literal percent search doesn't act as a wildcard", async () => {
    const literal = await draftStory({ headlineEn: "percent-test rates up 10% today" });
    const noPercent = await draftStory({ headlineEn: "percent-test rates up ten today" });

    const result = await listNewsStoriesForAdmin({ ...defaultParams, q: "percent-test rates up 10%" });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(literal.id);
    expect(ids).not.toContain(noPercent.id);
  });

  it("search is case-insensitive", async () => {
    const created = await draftStory({ headlineEn: "CaseSensitiveHeadlineTarget" });

    const result = await listNewsStoriesForAdmin({ ...defaultParams, q: "casesensitiveheadlinetarget" });

    expect(result.rows.map((r) => r.id)).toContain(created.id);
  });

  it("matches a term that only appears in the Hindi headline", async () => {
    const created = await draftStory({ headlineEn: "x", headlineHi: "hindi-only-headline-target" });

    const result = await listNewsStoriesForAdmin({ ...defaultParams, q: "hindi-only-headline-target" });

    expect(result.rows.map((r) => r.id)).toContain(created.id);
  });

  it("matches a term that only appears in the Hinglish (hx) headline", async () => {
    const created = await draftStory({ headlineEn: "x", headlineHx: "hinglish-only-headline-target" });

    const result = await listNewsStoriesForAdmin({ ...defaultParams, q: "hinglish-only-headline-target" });

    expect(result.rows.map((r) => r.id)).toContain(created.id);
  });

  it("filters by status", async () => {
    const draft = await draftStory({ headlineEn: "status-filter-test draft" });
    const toPublish = await draftStory({ headlineEn: "status-filter-test published" });
    await updateStoryStatusRow(toPublish.id, "published");

    const result = await listNewsStoriesForAdmin({
      ...defaultParams,
      q: "status-filter-test",
      status: "published",
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(toPublish.id);
    expect(ids).not.toContain(draft.id);
  });

  it("filters by category", async () => {
    const rbi = await draftStory({ headlineEn: "category-filter-test rbi", category: "rbi_rates" });
    const inflation = await draftStory({
      headlineEn: "category-filter-test inflation",
      category: "inflation",
    });

    const result = await listNewsStoriesForAdmin({
      ...defaultParams,
      q: "category-filter-test",
      category: "inflation",
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(inflation.id);
    expect(ids).not.toContain(rbi.id);
  });

  it("filters by topicId", async () => {
    const inTopicA = await draftStory({ headlineEn: "topic-filter-test a", topicId: topicA.id });
    const inTopicB = await draftStory({ headlineEn: "topic-filter-test b", topicId: topicB.id });

    const result = await listNewsStoriesForAdmin({
      ...defaultParams,
      q: "topic-filter-test",
      topicId: topicA.id,
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(inTopicA.id);
    expect(ids).not.toContain(inTopicB.id);
  });

  it("sorts by the whitelisted category column", async () => {
    // newsCategoryEnum is a native Postgres enum - it sorts by DECLARED
    // ordinal (rbi_rates, inflation, stock_market_basics, ...), not
    // lexicographically, so the "sorted" comparison has to use that same
    // order rather than a plain JS string sort.
    const CATEGORY_ENUM_ORDER = [
      "rbi_rates",
      "inflation",
      "stock_market_basics",
      "ipos_new_listings",
      "mutual_funds",
      "banking",
      "scams_fraud",
      "government_budget",
      "global_markets",
      "currency",
    ];
    const result = await listNewsStoriesForAdmin({ ...defaultParams, sort: "category", dir: "asc" });
    const ordinals = result.rows.map((r) => CATEGORY_ENUM_ORDER.indexOf(r.category));
    expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
  });

  it("clamps page to the last valid page and reports an accurate total/pageCount", async () => {
    const result = await listNewsStoriesForAdmin({ ...defaultParams, page: 999, pageSize: 5 });
    expect(result.page).toBe(result.pageCount);
    expect(result.rows.length).toBeLessThanOrEqual(5);
    expect(result.total).toBeGreaterThan(0);
  });

  it("returns the full headline LocalizedText (every pipeline table field, nothing extra)", async () => {
    const created = await draftStory({ headlineEn: "field-shape-test" });
    const result = await listNewsStoriesForAdmin({ ...defaultParams, q: "field-shape-test" });
    const row = result.rows.find((r) => r.id === created.id);
    expect(row).toBeDefined();
    expect(row?.headline).toEqual({ en: "field-shape-test", hi: "x", hx: "x" });
    expect(row).toEqual(
      expect.objectContaining({
        id: created.id,
        outlet: "Test Outlet",
        qualityGrade: "A",
        status: "draft",
      }),
    );
  });
});
