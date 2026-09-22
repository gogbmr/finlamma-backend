import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetQuestionById = vi.fn();
const mockHotfixQuestionRow = vi.fn();
const mockInsertDraftQuestion = vi.fn();
const mockListAllQuestions = vi.fn();
const mockPublishQuestionRow = vi.fn();
const mockUnpublishQuestionRow = vi.fn();
const mockUpdateDraftQuestion = vi.fn();
vi.mock("./repo", () => ({
  getQuestionById: (id: unknown) => mockGetQuestionById(id),
  hotfixQuestionRow: (input: unknown) => mockHotfixQuestionRow(input),
  insertDraftQuestion: (input: unknown) => mockInsertDraftQuestion(input),
  listAllQuestions: () => mockListAllQuestions(),
  publishQuestionRow: (id: unknown, staffId: unknown) => mockPublishQuestionRow(id, staffId),
  unpublishQuestionRow: (id: unknown) => mockUnpublishQuestionRow(id),
  updateDraftQuestion: (input: unknown) => mockUpdateDraftQuestion(input),
}));

const mockListPublishedLessonsReferencingQuestion = vi.fn();
vi.mock("@/server/lessons/service", () => ({
  listPublishedLessonsReferencingQuestion: (questionId: unknown) =>
    mockListPublishedLessonsReferencingQuestion(questionId),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import {
  createQuestionDraft,
  getQuestionEditorData,
  hotfixQuestion,
  publishQuestion,
  unpublishQuestion,
  updateQuestionDraft,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1" };

function questionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "question_1",
    format: "single_select" as const,
    topic: null,
    prompt: { en: "What is a stock?", hi: "स्टॉक क्या है?", hx: "Stock kya hai?" },
    explanation: { en: "A share of a company.", hi: "x", hx: "x" },
    payload: { options: [{ en: "A share", hi: "x", hx: "x" }, { en: "A loan", hi: "x", hx: "x" }] },
    answer: { correctIndex: 0 },
    status: "draft" as const,
    publishedAt: null,
    publishedBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no published lesson references the question - existing
  // unpublish-success tests below don't need to know about the
  // reverse-D18 gate at all.
  mockListPublishedLessonsReferencingQuestion.mockResolvedValue([]);
});

describe("createQuestionDraft", () => {
  it("creates the draft and logs it under the staff actor", async () => {
    mockInsertDraftQuestion.mockResolvedValueOnce(questionRow());

    const input = {
      format: "single_select" as const,
      topic: null,
      prompt: questionRow().prompt,
      explanation: questionRow().explanation,
      payload: questionRow().payload,
      answer: questionRow().answer,
    };
    const result = await createQuestionDraft(ACTOR, input, META);

    expect(result.id).toBe("question_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "staff", actorId: "staff_1", action: "question.created" }),
    );
  });
});

describe("updateQuestionDraft", () => {
  it("re-validates payload/answer against the existing question's format, rejecting a mismatched shape", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ format: "spot_mistake" }));

    await expect(
      updateQuestionDraft(
        ACTOR,
        {
          id: "question_1",
          topic: null,
          prompt: questionRow().prompt,
          explanation: questionRow().explanation,
          payload: { options: [{ en: "x", hi: "x", hx: "x" }, { en: "y", hi: "x", hx: "x" }] }, // single_select shape, not spot_mistake
          answer: { correctIndex: 0 },
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUpdateDraftQuestion).not.toHaveBeenCalled();
  });

  it("rejects an out-of-bounds answer even when the shape is structurally valid", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ format: "single_select" }));

    await expect(
      updateQuestionDraft(
        ACTOR,
        {
          id: "question_1",
          topic: null,
          prompt: questionRow().prompt,
          explanation: questionRow().explanation,
          payload: { options: [{ en: "x", hi: "x", hx: "x" }, { en: "y", hi: "x", hx: "x" }] },
          answer: { correctIndex: 5 }, // out of range for 2 options
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", details: { boundsErrors: expect.any(Array) } });
    expect(mockUpdateDraftQuestion).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown question", async () => {
    mockGetQuestionById.mockResolvedValueOnce(null);

    await expect(
      updateQuestionDraft(
        ACTOR,
        {
          id: "nope",
          topic: null,
          prompt: questionRow().prompt,
          explanation: questionRow().explanation,
          payload: questionRow().payload,
          answer: questionRow().answer,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the question is published or missing at the DB layer", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockUpdateDraftQuestion.mockResolvedValueOnce(null);

    await expect(
      updateQuestionDraft(
        ACTOR,
        {
          id: "question_1",
          topic: null,
          prompt: questionRow().prompt,
          explanation: questionRow().explanation,
          payload: questionRow().payload,
          answer: questionRow().answer,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("publishQuestion - translation-completeness gate", () => {
  it("blocks publish and names every missing field, including nested payload leaves", async () => {
    mockGetQuestionById.mockResolvedValueOnce(
      questionRow({
        prompt: { en: "What is a stock?", hi: "", hx: "Stock kya hai?" },
        payload: {
          options: [
            { en: "A share", hi: "x", hx: "" },
            { en: "A loan", hi: "x", hx: "x" },
          ],
        },
      }),
    );

    await expect(publishQuestion(ACTOR, "question_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { missingFields: ["prompt.hi", "payload.options[0].hx"] },
    });
    expect(mockPublishQuestionRow).not.toHaveBeenCalled();
  });

  it("publishes and logs it once every field is filled", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow());
    mockPublishQuestionRow.mockResolvedValueOnce(questionRow({ status: "published" }));

    const result = await publishQuestion(ACTOR, "question_1", META);

    expect(result.status).toBe("published");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "question.published", actorId: "staff_1" }),
    );
  });

  it("throws NOT_FOUND for an unknown question", async () => {
    mockGetQuestionById.mockResolvedValueOnce(null);

    await expect(publishQuestion(ACTOR, "nope", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the question is already published", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ status: "published" }));

    await expect(publishQuestion(ACTOR, "question_1", META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockPublishQuestionRow).not.toHaveBeenCalled();
  });
});

// D20 (docs/ARCHITECTURE.md): direct edit of a PUBLISHED question's
// prompt/explanation/payload/answer, without unpublishing.
describe("hotfixQuestion", () => {
  const HOTFIX_INPUT = {
    id: "question_1",
    prompt: { en: "Fixed prompt?", hi: "x", hx: "x" },
    explanation: { en: "Fixed explanation.", hi: "x", hx: "x" },
    payload: questionRow().payload,
    answer: { correctIndex: 1 },
  };

  it("updates a published question and logs whether the answer changed", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ status: "published" }));
    mockHotfixQuestionRow.mockResolvedValueOnce(
      questionRow({ status: "published", ...HOTFIX_INPUT, revision: 2 }),
    );

    const result = await hotfixQuestion(ACTOR, HOTFIX_INPUT, META);

    expect(result.revision).toBe(2);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "question.hotfixed",
        actorId: "staff_1",
        metadata: expect.objectContaining({ answerChanged: true, revision: 2 }),
      }),
    );
  });

  it("logs answerChanged: false when only text fields changed", async () => {
    const existing = questionRow({ status: "published" });
    mockGetQuestionById.mockResolvedValueOnce(existing);
    mockHotfixQuestionRow.mockResolvedValueOnce(
      questionRow({ status: "published", ...HOTFIX_INPUT, answer: existing.answer, revision: 2 }),
    );

    await hotfixQuestion(ACTOR, { ...HOTFIX_INPUT, answer: existing.answer }, META);

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ answerChanged: false }) }),
    );
  });

  it("throws NOT_FOUND for an unknown question", async () => {
    mockGetQuestionById.mockResolvedValueOnce(null);

    await expect(hotfixQuestion(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockHotfixQuestionRow).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when the question is a draft, not published", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ status: "draft" }));

    await expect(hotfixQuestion(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mockHotfixQuestionRow).not.toHaveBeenCalled();
  });

  it("rejects a structurally invalid payload for the question's format", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ status: "published", format: "spot_mistake" }));

    await expect(
      hotfixQuestion(ACTOR, { ...HOTFIX_INPUT, payload: { options: [] } }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockHotfixQuestionRow).not.toHaveBeenCalled();
  });

  it("rejects an out-of-bounds answer even when the shape is structurally valid", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ status: "published" }));

    await expect(
      hotfixQuestion(ACTOR, { ...HOTFIX_INPUT, answer: { correctIndex: 99 } }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockHotfixQuestionRow).not.toHaveBeenCalled();
  });

  it("rejects a fix that leaves a translation missing", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ status: "published" }));

    await expect(
      hotfixQuestion(
        ACTOR,
        { ...HOTFIX_INPUT, prompt: { en: "Fixed", hi: "", hx: "Fixed" } },
        META,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockHotfixQuestionRow).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when the repo returns null (concurrently unpublished)", async () => {
    mockGetQuestionById.mockResolvedValueOnce(questionRow({ status: "published" }));
    mockHotfixQuestionRow.mockResolvedValueOnce(null);

    await expect(hotfixQuestion(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("unpublishQuestion", () => {
  it("unpublishes and logs it", async () => {
    mockUnpublishQuestionRow.mockResolvedValueOnce(questionRow({ status: "draft" }));

    const result = await unpublishQuestion(ACTOR, "question_1", META);

    expect(result.status).toBe("draft");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "question.unpublished" }),
    );
  });

  it("throws CONFLICT when the question isn't published", async () => {
    mockUnpublishQuestionRow.mockResolvedValueOnce(null);

    await expect(unpublishQuestion(ACTOR, "question_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  // Reverse of D18's publish-time check: a question can't be unpublished
  // while a published lesson still references it, same pattern as
  // mentors/service.ts's unpublishMentor and worlds/service.ts's
  // unpublishWorld.
  it("blocks unpublish and names every referencing published lesson, without touching the row", async () => {
    mockListPublishedLessonsReferencingQuestion.mockResolvedValueOnce([
      { id: "lesson_1", title: { en: "Intro to Stocks" }, chapter: 1, step: 2 },
      { id: "lesson_2", title: { en: "Bonds Basics" }, chapter: 2, step: 1 },
    ]);

    await expect(unpublishQuestion(ACTOR, "question_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/Intro to Stocks[\s\S]*Bonds Basics/),
      details: { lessonIds: ["lesson_1", "lesson_2"] },
    });
    expect(mockUnpublishQuestionRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("allows unpublish once no published lesson references the question anymore", async () => {
    mockListPublishedLessonsReferencingQuestion.mockResolvedValueOnce([]);
    mockUnpublishQuestionRow.mockResolvedValueOnce(questionRow({ status: "draft" }));

    const result = await unpublishQuestion(ACTOR, "question_1", META);

    expect(result.status).toBe("draft");
  });
});

describe("getQuestionEditorData", () => {
  it("returns every question regardless of status", async () => {
    mockListAllQuestions.mockResolvedValueOnce([questionRow(), questionRow({ id: "question_2" })]);

    const result = await getQuestionEditorData();

    expect(result).toHaveLength(2);
  });
});
