// Integration test against an in-process PGlite database (src/test/db.ts),
// not a mock - proves the draft-only update/publish guards and
// getQuestionsByIds actually hold at the database level. Never touches the
// real Supabase database (see @/db/client's NODE_ENV=test guard).
// src/server/questions/service.test.ts covers the service layer with this
// repo mocked out.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { roles, staffMembers } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { uniqueClerkUserId } from "@/test/fixtures";

vi.mock("@/db/client", async () => ({ db: await createTestDb() }));

const {
  getQuestionById,
  getQuestionsByIds,
  insertDraftQuestion,
  publishQuestionRow,
  unpublishQuestionRow,
  updateDraftQuestion,
} = await import("./repo");
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
  .values({ clerkUserId: uniqueClerkUserId("questions-repo-test-staff"), roleId: testRole.id })
  .returning();
const staffId = testStaff.id;

const PROMPT = { en: "What is a stock?", hi: "x", hx: "x" };
const EXPLANATION = { en: "A share of a company.", hi: "x", hx: "x" };

function draftInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    format: "single_select" as const,
    topic: null,
    prompt: PROMPT,
    explanation: EXPLANATION,
    payload: { options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }] },
    answer: { correctIndex: 0 },
    ...overrides,
  };
}

describe("insertDraftQuestion", () => {
  it("creates a draft question", async () => {
    const created = await insertDraftQuestion(draftInput());
    expect(created.status).toBe("draft");
  });
});

describe("updateDraftQuestion", () => {
  it("updates a draft question's fields", async () => {
    const created = await insertDraftQuestion(draftInput());
    const updated = await updateDraftQuestion({
      id: created.id,
      topic: "RBI & Rates",
      prompt: { en: "Updated", hi: "x", hx: "x" },
      explanation: created.explanation,
      payload: created.payload,
      answer: created.answer,
    });
    expect(updated?.prompt.en).toBe("Updated");
    expect(updated?.topic).toBe("RBI & Rates");
  });

  it("returns null (does not update) when the question is currently published", async () => {
    const created = await insertDraftQuestion(draftInput());
    await publishQuestionRow(created.id, staffId);

    const result = await updateDraftQuestion({
      id: created.id,
      topic: null,
      prompt: { en: "Should not apply", hi: "x", hx: "x" },
      explanation: created.explanation,
      payload: created.payload,
      answer: created.answer,
    });

    expect(result).toBeNull();
    const row = await getQuestionById(created.id);
    expect(row?.prompt.en).not.toBe("Should not apply");
  });

  it("returns null for a nonexistent question", async () => {
    const result = await updateDraftQuestion({
      id: randomUUID(),
      topic: null,
      prompt: PROMPT,
      explanation: EXPLANATION,
      payload: draftInput().payload,
      answer: draftInput().answer,
    });
    expect(result).toBeNull();
  });
});

describe("publishQuestionRow / unpublishQuestionRow", () => {
  it("publishes a draft question, stamping publishedAt/publishedBy", async () => {
    const created = await insertDraftQuestion(draftInput());

    const published = await publishQuestionRow(created.id, staffId);

    expect(published?.status).toBe("published");
    expect(published?.publishedBy).toBe(staffId);
    expect(published?.publishedAt).toBeInstanceOf(Date);
  });

  it("returns null when the question is already published (not a draft)", async () => {
    const created = await insertDraftQuestion(draftInput());
    await publishQuestionRow(created.id, staffId);

    const result = await publishQuestionRow(created.id, staffId);

    expect(result).toBeNull();
  });

  it("unpublishes a published question back to draft, clearing publishedAt/publishedBy", async () => {
    const created = await insertDraftQuestion(draftInput());
    await publishQuestionRow(created.id, staffId);

    const unpublished = await unpublishQuestionRow(created.id);

    expect(unpublished?.status).toBe("draft");
    expect(unpublished?.publishedAt).toBeNull();
    expect(unpublished?.publishedBy).toBeNull();
  });
});

describe("getQuestionsByIds", () => {
  it("returns an empty array without querying for an empty id list", async () => {
    expect(await getQuestionsByIds([])).toEqual([]);
  });

  it("returns only the questions matching the given ids, any status", async () => {
    const draft = await insertDraftQuestion(draftInput());
    const published = await insertDraftQuestion(draftInput());
    await publishQuestionRow(published.id, staffId);
    const other = await insertDraftQuestion(draftInput());

    const result = await getQuestionsByIds([draft.id, published.id]);

    expect(result.map((q) => q.id).sort()).toEqual([draft.id, published.id].sort());
    expect(result.map((q) => q.id)).not.toContain(other.id);
  });

  it("returns [] for ids that don't exist", async () => {
    const result = await getQuestionsByIds([randomUUID()]);
    expect(result).toEqual([]);
  });
});
