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

const mockCreateLessonDraft = vi.fn();
const mockUpdateLessonDraft = vi.fn();
const mockPublishLesson = vi.fn();
const mockUnpublishLesson = vi.fn();
vi.mock("@/server/lessons/service", () => ({
  createLessonDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockCreateLessonDraft(actor, input, meta),
  updateLessonDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateLessonDraft(actor, input, meta),
  publishLesson: (actor: unknown, id: unknown, meta: unknown) => mockPublishLesson(actor, id, meta),
  unpublishLesson: (actor: unknown, id: unknown, meta: unknown) =>
    mockUnpublishLesson(actor, id, meta),
}));

import {
  createLessonDraftAction,
  publishLessonAction,
  unpublishLessonAction,
  updateLessonDraftAction,
} from "./actions";

const ACTOR = { id: "staff_1" };
const LESSON_ID = "11111111-1111-4111-8111-111111111111";
const WORLD_ID = "22222222-2222-4222-8222-222222222222";
const VALID_INPUT = {
  worldId: WORLD_ID,
  chapter: 1,
  step: 1,
  kind: "quiz" as const,
  title: { en: "Test", hi: "x", hx: "x" },
  blurb: { en: "x", hi: "x", hx: "x" },
  content: { questionIds: ["33333333-3333-4333-8333-333333333333"] },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("createLessonDraftAction: requires lesson.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.manage"));

    const result = await createLessonDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: lesson.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("lesson.manage");
    expect(mockCreateLessonDraft).not.toHaveBeenCalled();
  });

  it("updateLessonDraftAction: requires lesson.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.manage"));

    const result = await updateLessonDraftAction({ id: LESSON_ID, ...VALID_INPUT });

    expect(result.ok).toBe(false);
    expect(mockUpdateLessonDraft).not.toHaveBeenCalled();
  });

  it("publishLessonAction: requires lesson.publish, not lesson.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.publish"));

    const result = await publishLessonAction({ id: LESSON_ID });

    expect(result.ok).toBe(false);
    expect(mockRequireStaff).toHaveBeenCalledWith("lesson.publish");
    expect(mockPublishLesson).not.toHaveBeenCalled();
  });

  it("unpublishLessonAction: requires lesson.publish", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.publish"));

    const result = await unpublishLessonAction({ id: LESSON_ID });

    expect(result.ok).toBe(false);
    expect(mockUnpublishLesson).not.toHaveBeenCalled();
  });
});

describe("happy paths", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("createLessonDraftAction creates and revalidates", async () => {
    mockCreateLessonDraft.mockResolvedValueOnce({ id: LESSON_ID });

    const result = await createLessonDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockCreateLessonDraft).toHaveBeenCalledWith(ACTOR, VALID_INPUT, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/lessons");
  });

  it("createLessonDraftAction rejects an unbuildable content shape without calling the service", async () => {
    const result = await createLessonDraftAction({
      ...VALID_INPUT,
      kind: "video",
      content: { questionIds: [] }, // wrong shape for video
    });

    expect(result.ok).toBe(false);
    expect(mockCreateLessonDraft).not.toHaveBeenCalled();
  });

  it("createLessonDraftAction rejects a doubt_zone kind (not creatable until Checkpoint 4b)", async () => {
    const result = await createLessonDraftAction({ ...VALID_INPUT, kind: "doubt_zone" });

    expect(result.ok).toBe(false);
    expect(mockCreateLessonDraft).not.toHaveBeenCalled();
  });

  it("publishLessonAction publishes and revalidates", async () => {
    mockPublishLesson.mockResolvedValueOnce({ id: LESSON_ID, status: "published" });

    const result = await publishLessonAction({ id: LESSON_ID });

    expect(result).toEqual({ ok: true });
    expect(mockPublishLesson).toHaveBeenCalledWith(ACTOR, LESSON_ID, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/lessons");
  });

  it("publishLessonAction surfaces the world-not-published error to the caller", async () => {
    mockPublishLesson.mockRejectedValueOnce(
      new AppError("CONFLICT", 'Cannot publish: world "Money World" is not published yet'),
    );

    const result = await publishLessonAction({ id: LESSON_ID });

    expect(result).toEqual({
      ok: false,
      error: 'Cannot publish: world "Money World" is not published yet',
    });
  });

  it("unpublishLessonAction unpublishes and revalidates", async () => {
    mockUnpublishLesson.mockResolvedValueOnce({ id: LESSON_ID, status: "draft" });

    const result = await unpublishLessonAction({ id: LESSON_ID });

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/lessons");
  });
});
