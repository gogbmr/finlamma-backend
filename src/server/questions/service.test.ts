import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetQuestionById = vi.fn();
const mockInsertDraftQuestion = vi.fn();
const mockListAllQuestions = vi.fn();
const mockPublishQuestionRow = vi.fn();
const mockUnpublishQuestionRow = vi.fn();
const mockUpdateDraftQuestion = vi.fn();
vi.mock("./repo", () => ({
  getQuestionById: (id: unknown) => mockGetQuestionById(id),
  insertDraftQuestion: (input: unknown) => mockInsertDraftQuestion(input),
  listAllQuestions: () => mockListAllQuestions(),
  publishQuestionRow: (id: unknown, staffId: unknown) => mockPublishQuestionRow(id, staffId),
  unpublishQuestionRow: (id: unknown) => mockUnpublishQuestionRow(id),
  updateDraftQuestion: (input: unknown) => mockUpdateDraftQuestion(input),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import {
  createQuestionDraft,
  getQuestionEditorData,
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
});

describe("getQuestionEditorData", () => {
  it("returns every question regardless of status", async () => {
    mockListAllQuestions.mockResolvedValueOnce([questionRow(), questionRow({ id: "question_2" })]);

    const result = await getQuestionEditorData();

    expect(result).toHaveLength(2);
  });
});
