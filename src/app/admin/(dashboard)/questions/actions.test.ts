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

const mockCreateQuestionDraft = vi.fn();
const mockUpdateQuestionDraft = vi.fn();
const mockHotfixQuestion = vi.fn();
const mockPublishQuestion = vi.fn();
const mockUnpublishQuestion = vi.fn();
vi.mock("@/server/questions/service", () => ({
  createQuestionDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockCreateQuestionDraft(actor, input, meta),
  updateQuestionDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateQuestionDraft(actor, input, meta),
  hotfixQuestion: (actor: unknown, input: unknown, meta: unknown) =>
    mockHotfixQuestion(actor, input, meta),
  publishQuestion: (actor: unknown, id: unknown, meta: unknown) =>
    mockPublishQuestion(actor, id, meta),
  unpublishQuestion: (actor: unknown, id: unknown, meta: unknown) =>
    mockUnpublishQuestion(actor, id, meta),
}));

import {
  createQuestionDraftAction,
  hotfixQuestionAction,
  publishQuestionAction,
  unpublishQuestionAction,
  updateQuestionDraftAction,
} from "./actions";

const ACTOR = { id: "staff_1" };
const QUESTION_ID = "11111111-1111-4111-8111-111111111111";
const VALID_INPUT = {
  format: "single_select" as const,
  topic: null,
  prompt: { en: "What is a stock?", hi: "x", hx: "x" },
  explanation: { en: "A share.", hi: "x", hx: "x" },
  payload: { options: [{ en: "A", hi: "x", hx: "x" }, { en: "B", hi: "x", hx: "x" }] },
  answer: { correctIndex: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("createQuestionDraftAction: requires question.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: question.manage"));

    const result = await createQuestionDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: question.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("question.manage");
    expect(mockCreateQuestionDraft).not.toHaveBeenCalled();
  });

  it("updateQuestionDraftAction: requires question.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: question.manage"));

    const result = await updateQuestionDraftAction({ id: QUESTION_ID, ...VALID_INPUT });

    expect(result.ok).toBe(false);
    expect(mockUpdateQuestionDraft).not.toHaveBeenCalled();
  });

  it("publishQuestionAction: requires question.publish, not question.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: question.publish"),
    );

    const result = await publishQuestionAction({ id: QUESTION_ID });

    expect(result.ok).toBe(false);
    expect(mockRequireStaff).toHaveBeenCalledWith("question.publish");
    expect(mockPublishQuestion).not.toHaveBeenCalled();
  });

  it("unpublishQuestionAction: requires question.publish", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: question.publish"),
    );

    const result = await unpublishQuestionAction({ id: QUESTION_ID });

    expect(result.ok).toBe(false);
    expect(mockUnpublishQuestion).not.toHaveBeenCalled();
  });

  it("hotfixQuestionAction: requires question.publish, not question.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(
      new AppError("FORBIDDEN", "Missing permission: question.publish"),
    );

    const result = await hotfixQuestionAction({
      id: QUESTION_ID,
      prompt: VALID_INPUT.prompt,
      explanation: VALID_INPUT.explanation,
      payload: VALID_INPUT.payload,
      answer: VALID_INPUT.answer,
    });

    expect(result.ok).toBe(false);
    expect(mockRequireStaff).toHaveBeenCalledWith("question.publish");
    expect(mockHotfixQuestion).not.toHaveBeenCalled();
  });
});

describe("happy paths", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("createQuestionDraftAction creates and revalidates", async () => {
    mockCreateQuestionDraft.mockResolvedValueOnce({ id: QUESTION_ID });

    const result = await createQuestionDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockCreateQuestionDraft).toHaveBeenCalledWith(ACTOR, VALID_INPUT, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/questions");
  });

  it("createQuestionDraftAction rejects an out-of-bounds answer without calling the service", async () => {
    const result = await createQuestionDraftAction({
      ...VALID_INPUT,
      answer: { correctIndex: 99 },
    });

    expect(result.ok).toBe(false);
    expect(mockCreateQuestionDraft).not.toHaveBeenCalled();
  });

  it("createQuestionDraftAction rejects a payload/format mismatch without calling the service", async () => {
    const result = await createQuestionDraftAction({
      ...VALID_INPUT,
      format: "spot_mistake",
      // payload is single_select-shaped, not spot_mistake-shaped
    });

    expect(result.ok).toBe(false);
    expect(mockCreateQuestionDraft).not.toHaveBeenCalled();
  });

  it("publishQuestionAction publishes and revalidates", async () => {
    mockPublishQuestion.mockResolvedValueOnce({ id: QUESTION_ID, status: "published" });

    const result = await publishQuestionAction({ id: QUESTION_ID });

    expect(result).toEqual({ ok: true });
    expect(mockPublishQuestion).toHaveBeenCalledWith(ACTOR, QUESTION_ID, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/questions");
  });

  it("publishQuestionAction surfaces a translation-completeness error to the caller", async () => {
    mockPublishQuestion.mockRejectedValueOnce(
      new AppError("VALIDATION_FAILED", "Cannot publish: missing translation for prompt.hi"),
    );

    const result = await publishQuestionAction({ id: QUESTION_ID });

    expect(result).toEqual({
      ok: false,
      error: "Cannot publish: missing translation for prompt.hi",
    });
  });

  it("unpublishQuestionAction unpublishes and revalidates", async () => {
    mockUnpublishQuestion.mockResolvedValueOnce({ id: QUESTION_ID, status: "draft" });

    const result = await unpublishQuestionAction({ id: QUESTION_ID });

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/questions");
  });

  it("hotfixQuestionAction hotfixes and revalidates", async () => {
    mockHotfixQuestion.mockResolvedValueOnce({ id: QUESTION_ID, status: "published" });

    const result = await hotfixQuestionAction({
      id: QUESTION_ID,
      prompt: VALID_INPUT.prompt,
      explanation: VALID_INPUT.explanation,
      payload: VALID_INPUT.payload,
      answer: VALID_INPUT.answer,
    });

    expect(result).toEqual({ ok: true });
    expect(mockHotfixQuestion).toHaveBeenCalledWith(
      ACTOR,
      {
        id: QUESTION_ID,
        prompt: VALID_INPUT.prompt,
        explanation: VALID_INPUT.explanation,
        payload: VALID_INPUT.payload,
        answer: VALID_INPUT.answer,
      },
      expect.any(Object),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/questions");
  });

  // Unlike CreateQuestionDraftSchema, HotfixQuestionSchema does no
  // structural/bounds cross-checking at the Zod layer - that's the service's
  // job (hotfixQuestion calls validatePayloadAndAnswer against the
  // *existing* question's format, which the action can't know without
  // fetching the row first). This test just proves a service-level
  // rejection surfaces the same way every other action does.
  it("hotfixQuestionAction surfaces a bounds-check error from the service to the caller", async () => {
    mockHotfixQuestion.mockRejectedValueOnce(
      new AppError("VALIDATION_FAILED", "Cannot save: answer.correctIndex (99) is out of range for 2 options"),
    );

    const result = await hotfixQuestionAction({
      id: QUESTION_ID,
      prompt: VALID_INPUT.prompt,
      explanation: VALID_INPUT.explanation,
      payload: VALID_INPUT.payload,
      answer: { correctIndex: 99 },
    });

    expect(result).toEqual({
      ok: false,
      error: "Cannot save: answer.correctIndex (99) is out of range for 2 options",
    });
  });
});
