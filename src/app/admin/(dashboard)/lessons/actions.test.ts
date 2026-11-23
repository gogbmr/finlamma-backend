import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

const mockRequireStaff = vi.fn();
const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireStaff: (permission: unknown) => mockRequireStaff(permission),
  getStaffMember: () => mockGetStaffMember(),
}));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) =>
    mockRoleHasPermission(roleId, permission),
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
const mockHotfixLesson = vi.fn();
const mockPublishLesson = vi.fn();
const mockUnpublishLesson = vi.fn();
const mockDeleteLesson = vi.fn();
const mockGetLessonPreview = vi.fn();
vi.mock("@/server/lessons/service", () => ({
  createLessonDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockCreateLessonDraft(actor, input, meta),
  updateLessonDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateLessonDraft(actor, input, meta),
  hotfixLesson: (actor: unknown, input: unknown, meta: unknown) =>
    mockHotfixLesson(actor, input, meta),
  publishLesson: (actor: unknown, id: unknown, meta: unknown) => mockPublishLesson(actor, id, meta),
  unpublishLesson: (actor: unknown, id: unknown, meta: unknown) =>
    mockUnpublishLesson(actor, id, meta),
  deleteLesson: (actor: unknown, id: unknown, meta: unknown) => mockDeleteLesson(actor, id, meta),
  getLessonPreview: (id: unknown) => mockGetLessonPreview(id),
}));

import {
  createLessonDraftAction,
  deleteLessonAction,
  hotfixLessonAction,
  previewLessonAction,
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
  it("createLessonDraftAction: requires lesson.create", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.create"));

    const result = await createLessonDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: lesson.create" });
    expect(mockRequireStaff).toHaveBeenCalledWith("lesson.create");
    expect(mockCreateLessonDraft).not.toHaveBeenCalled();
  });

  it("updateLessonDraftAction: requires lesson.edit", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.edit"));

    const result = await updateLessonDraftAction({ id: LESSON_ID, ...VALID_INPUT });

    expect(result.ok).toBe(false);
    expect(mockUpdateLessonDraft).not.toHaveBeenCalled();
  });

  it("publishLessonAction: requires lesson.delete, not lesson.edit", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.delete"));

    const result = await publishLessonAction({ id: LESSON_ID });

    expect(result.ok).toBe(false);
    expect(mockRequireStaff).toHaveBeenCalledWith("lesson.delete");
    expect(mockPublishLesson).not.toHaveBeenCalled();
  });

  it("unpublishLessonAction: requires lesson.delete", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.delete"));

    const result = await unpublishLessonAction({ id: LESSON_ID });

    expect(result.ok).toBe(false);
    expect(mockUnpublishLesson).not.toHaveBeenCalled();
  });

  it("hotfixLessonAction: requires lesson.delete, not lesson.edit", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.delete"));

    const result = await hotfixLessonAction({
      id: LESSON_ID,
      title: VALID_INPUT.title,
      blurb: VALID_INPUT.blurb,
      content: VALID_INPUT.content,
    });

    expect(result.ok).toBe(false);
    expect(mockRequireStaff).toHaveBeenCalledWith("lesson.delete");
    expect(mockHotfixLesson).not.toHaveBeenCalled();
  });

  // Gated on lesson.delete, not lesson.edit - deletion is permanent and
  // irreversible, same trust bar as worlds/actions.ts's deleteWorldAction.
  it("deleteLessonAction: requires lesson.delete, not lesson.edit", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: lesson.delete"));

    const result = await deleteLessonAction({ id: LESSON_ID });

    expect(result.ok).toBe(false);
    expect(mockRequireStaff).toHaveBeenCalledWith("lesson.delete");
    expect(mockDeleteLesson).not.toHaveBeenCalled();
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

  it("createLessonDraftAction creates a valid doubt_zone lesson", async () => {
    mockCreateLessonDraft.mockResolvedValueOnce({ id: LESSON_ID });

    const result = await createLessonDraftAction({
      ...VALID_INPUT,
      kind: "doubt_zone",
      content: {
        mentorKey: "baby",
        educationalOnlyNote: { en: "Educational only.", hi: "x", hx: "x" },
        chips: [
          {
            chipLabel: { en: "What is a stock?", hi: "x", hx: "x" },
            reply: { en: "A share of a company.", hi: "x", hx: "x" },
          },
        ],
      },
    });

    expect(result).toEqual({ ok: true });
    expect(mockCreateLessonDraft).toHaveBeenCalled();
  });

  it("createLessonDraftAction rejects a doubt_zone lesson missing mentorKey, without calling the service", async () => {
    const result = await createLessonDraftAction({
      ...VALID_INPUT,
      kind: "doubt_zone",
      content: {
        educationalOnlyNote: { en: "x", hi: "x", hx: "x" },
        chips: [{ chipLabel: { en: "x", hi: "x", hx: "x" }, reply: { en: "x", hi: "x", hx: "x" } }],
      },
    });

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

  it("unpublishLessonAction surfaces the boss_quiz block to the caller", async () => {
    mockUnpublishLesson.mockRejectedValueOnce(
      new AppError("CONFLICT", "Cannot unpublish: this is a world's Boss Quiz"),
    );

    const result = await unpublishLessonAction({ id: LESSON_ID });

    expect(result).toEqual({ ok: false, error: "Cannot unpublish: this is a world's Boss Quiz" });
  });

  it("deleteLessonAction deletes and revalidates", async () => {
    mockDeleteLesson.mockResolvedValueOnce({ id: LESSON_ID });

    const result = await deleteLessonAction({ id: LESSON_ID });

    expect(result).toEqual({ ok: true });
    expect(mockDeleteLesson).toHaveBeenCalledWith(ACTOR, LESSON_ID, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/lessons");
  });

  it("deleteLessonAction surfaces the still-published block to the caller", async () => {
    mockDeleteLesson.mockRejectedValueOnce(
      new AppError("CONFLICT", "Lesson not found, or it's currently published - unpublish it first to delete"),
    );

    const result = await deleteLessonAction({ id: LESSON_ID });

    expect(result).toEqual({
      ok: false,
      error: "Lesson not found, or it's currently published - unpublish it first to delete",
    });
  });

  it("hotfixLessonAction hotfixes and revalidates", async () => {
    mockHotfixLesson.mockResolvedValueOnce({ id: LESSON_ID, status: "published" });

    const result = await hotfixLessonAction({
      id: LESSON_ID,
      title: VALID_INPUT.title,
      blurb: VALID_INPUT.blurb,
      content: VALID_INPUT.content,
    });

    expect(result).toEqual({ ok: true });
    expect(mockHotfixLesson).toHaveBeenCalledWith(
      ACTOR,
      { id: LESSON_ID, title: VALID_INPUT.title, blurb: VALID_INPUT.blurb, content: VALID_INPUT.content },
      expect.any(Object),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/lessons");
  });
});

const STAFF = { id: "staff_1", roleId: "role_1" };

describe("previewLessonAction - read-only, gated on lesson.view", () => {
  beforeEach(() => {
    mockGetStaffMember.mockReset();
    mockRoleHasPermission.mockReset();
    mockGetLessonPreview.mockReset();
  });

  it("rejects when not signed in as staff at all", async () => {
    mockGetStaffMember.mockResolvedValueOnce(null);

    const result = await previewLessonAction({ id: LESSON_ID });

    expect(result.ok).toBe(false);
    expect(mockGetLessonPreview).not.toHaveBeenCalled();
  });

  it("rejects a staff member without lesson.view", async () => {
    mockGetStaffMember.mockResolvedValueOnce(STAFF);
    mockRoleHasPermission.mockResolvedValueOnce(false);

    const result = await previewLessonAction({ id: LESSON_ID });

    expect(result.ok).toBe(false);
    expect(mockGetLessonPreview).not.toHaveBeenCalled();
  });

  it("allows a staff member with lesson.view", async () => {
    mockGetStaffMember.mockResolvedValueOnce(STAFF);
    mockRoleHasPermission.mockResolvedValueOnce(true);
    mockGetLessonPreview.mockResolvedValueOnce({ id: LESSON_ID, kind: "quiz" });

    const result = await previewLessonAction({ id: LESSON_ID });

    expect(result).toEqual({ ok: true, data: { id: LESSON_ID, kind: "quiz" } });
  });

  it("surfaces a NOT_FOUND from the service as a clean error", async () => {
    mockGetStaffMember.mockResolvedValueOnce(STAFF);
    mockRoleHasPermission.mockResolvedValueOnce(true);
    mockGetLessonPreview.mockRejectedValueOnce(new AppError("NOT_FOUND", "Lesson not found"));

    const result = await previewLessonAction({ id: LESSON_ID });

    expect(result).toEqual({ ok: false, error: "Lesson not found" });
  });
});
