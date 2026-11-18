// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the real DB query (sort whitelist, ILIKE escaping,
// filters, page math) actually behaves correctly, not just that it
// compiles. Never touches the real Supabase database (see @/db/client's
// NODE_ENV=test guard).
import { afterAll, describe, expect, it, vi } from "vitest";
import { roles, staffMembers, topics } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const { listQuestionsForAdmin } = await import("./admin-queries");
const { insertDraftQuestion, publishQuestionRow } = await import("./repo");
const { db } = (await import("@/db/client")) as unknown as { db: TestDb };

afterAll(async () => {
  await db.$client.close();
});

const [testRole] = await db
  .insert(roles)
  .values({ key: "super_admin", name: "Super Admin" })
  .returning();
const [testStaff] = await db
  .insert(staffMembers)
  .values({ clerkUserId: uniqueClerkUserId("questions-admin-queries-test-staff"), roleId: testRole.id })
  .returning();
const staffId = testStaff.id;

const [topicA] = await db
  .insert(topics)
  .values({ order: 1, name: { en: "Topic A", hi: "x", hx: "x" } })
  .returning();
const [topicB] = await db
  .insert(topics)
  .values({ order: 2, name: { en: "Topic B", hi: "x", hx: "x" } })
  .returning();

function draftInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    format: "single_select" as const,
    topicId: null,
    prompt: { en: "default prompt", hi: "x", hx: "x" },
    explanation: { en: "x", hi: "x", hx: "x" },
    payload: { options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }] },
    answer: { correctIndex: 0 },
    ...overrides,
  };
}

const defaultParams = {
  page: 1,
  pageSize: 20,
  sort: "createdAt" as const,
  dir: "asc" as const,
  q: "",
  format: null,
  status: null,
  topicId: null,
};

describe("listQuestionsForAdmin", () => {
  it("escapes % and _ so a literal underscore search doesn't act as a wildcard", async () => {
    const literal = await insertDraftQuestion(
      draftInput({ prompt: { en: `escape-test code a_b works`, hi: "x", hx: "x" } }),
    );
    const wildcardMatch = await insertDraftQuestion(
      draftInput({ prompt: { en: `escape-test code aXb works`, hi: "x", hx: "x" } }),
    );

    const result = await listQuestionsForAdmin({ ...defaultParams, q: "escape-test code a_b" });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(literal.id);
    expect(ids).not.toContain(wildcardMatch.id);
  });

  it("escapes % so a literal percent search doesn't act as a wildcard", async () => {
    const literal = await insertDraftQuestion(
      draftInput({ prompt: { en: "percent-test 50% off", hi: "x", hx: "x" } }),
    );
    const noPercent = await insertDraftQuestion(
      draftInput({ prompt: { en: "percent-test fifty off", hi: "x", hx: "x" } }),
    );

    const result = await listQuestionsForAdmin({ ...defaultParams, q: "percent-test 50%" });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(literal.id);
    expect(ids).not.toContain(noPercent.id);
  });

  it("search is case-insensitive", async () => {
    const created = await insertDraftQuestion(
      draftInput({ prompt: { en: "CaseSensitiveSearchTarget", hi: "x", hx: "x" } }),
    );

    const result = await listQuestionsForAdmin({ ...defaultParams, q: "casesensitivesearchtarget" });

    expect(result.rows.map((r) => r.id)).toContain(created.id);
  });

  it("matches a term that only appears in the Hindi prompt", async () => {
    const created = await insertDraftQuestion(
      draftInput({ prompt: { en: "x", hi: "hindi-only-search-target", hx: "x" } }),
    );

    const result = await listQuestionsForAdmin({ ...defaultParams, q: "hindi-only-search-target" });

    expect(result.rows.map((r) => r.id)).toContain(created.id);
  });

  it("matches a term that only appears in the Hinglish (hx) prompt", async () => {
    const created = await insertDraftQuestion(
      draftInput({ prompt: { en: "x", hi: "x", hx: "hinglish-only-search-target" } }),
    );

    const result = await listQuestionsForAdmin({ ...defaultParams, q: "hinglish-only-search-target" });

    expect(result.rows.map((r) => r.id)).toContain(created.id);
  });

  it("filters by format", async () => {
    const singleSelect = await insertDraftQuestion(
      draftInput({ format: "single_select", prompt: { en: "format-filter-test one", hi: "x", hx: "x" } }),
    );
    const ordering = await insertDraftQuestion(
      draftInput({
        format: "ordering",
        prompt: { en: "format-filter-test two", hi: "x", hx: "x" },
        payload: { items: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }] },
        answer: { order: [0, 1] },
      }),
    );

    const result = await listQuestionsForAdmin({
      ...defaultParams,
      q: "format-filter-test",
      format: "ordering",
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(ordering.id);
    expect(ids).not.toContain(singleSelect.id);
  });

  it("filters by status", async () => {
    const draft = await insertDraftQuestion(
      draftInput({ prompt: { en: "status-filter-test draft", hi: "x", hx: "x" } }),
    );
    const toPublish = await insertDraftQuestion(
      draftInput({ prompt: { en: "status-filter-test published", hi: "x", hx: "x" } }),
    );
    await publishQuestionRow(toPublish.id, staffId);

    const result = await listQuestionsForAdmin({
      ...defaultParams,
      q: "status-filter-test",
      status: "published",
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(toPublish.id);
    expect(ids).not.toContain(draft.id);
  });

  it("filters by topicId", async () => {
    const inTopicA = await insertDraftQuestion(
      draftInput({ topicId: topicA.id, prompt: { en: "topic-filter-test a", hi: "x", hx: "x" } }),
    );
    const inTopicB = await insertDraftQuestion(
      draftInput({ topicId: topicB.id, prompt: { en: "topic-filter-test b", hi: "x", hx: "x" } }),
    );

    const result = await listQuestionsForAdmin({
      ...defaultParams,
      q: "topic-filter-test",
      topicId: topicA.id,
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(inTopicA.id);
    expect(ids).not.toContain(inTopicB.id);
  });

  it("sorts by the whitelisted status column", async () => {
    const result = await listQuestionsForAdmin({ ...defaultParams, sort: "status", dir: "asc" });
    const statuses = result.rows.map((r) => r.status);
    const sorted = [...statuses].sort();
    expect(statuses).toEqual(sorted);
  });

  it("clamps page to the last valid page and reports an accurate total/pageCount", async () => {
    const result = await listQuestionsForAdmin({ ...defaultParams, page: 999, pageSize: 5 });
    expect(result.page).toBe(result.pageCount);
    expect(result.rows.length).toBeLessThanOrEqual(5);
    expect(result.total).toBeGreaterThan(0);
  });

  it("only returns the fields the table shows, not payload/answer/explanation", async () => {
    const result = await listQuestionsForAdmin({ ...defaultParams, pageSize: 1 });
    const row = result.rows[0];
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("payload");
    expect(row).not.toHaveProperty("answer");
    expect(row).not.toHaveProperty("explanation");
    expect(row).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        format: expect.any(String),
        status: expect.any(String),
      }),
    );
  });
});
