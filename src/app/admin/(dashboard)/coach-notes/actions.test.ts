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

const mockCreateCoachNoteTemplate = vi.fn();
const mockUpdateCoachNoteTemplate = vi.fn();
const mockPublishCoachNoteTemplate = vi.fn();
const mockUnpublishCoachNoteTemplate = vi.fn();
vi.mock("@/server/report-card/service", () => ({
  createCoachNoteTemplate: (actor: unknown, input: unknown, meta: unknown) =>
    mockCreateCoachNoteTemplate(actor, input, meta),
  updateCoachNoteTemplate: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateCoachNoteTemplate(actor, input, meta),
  publishCoachNoteTemplate: (actor: unknown, id: unknown, meta: unknown) =>
    mockPublishCoachNoteTemplate(actor, id, meta),
  unpublishCoachNoteTemplate: (actor: unknown, id: unknown, meta: unknown) =>
    mockUnpublishCoachNoteTemplate(actor, id, meta),
}));

import {
  createCoachNoteTemplateAction,
  publishCoachNoteTemplateAction,
  unpublishCoachNoteTemplateAction,
  updateCoachNoteTemplateAction,
} from "./actions";

const ACTOR = { id: "staff_1" };
const TEMPLATE_ID = "b3b6c6f0-8f2a-4b8b-9f0a-2b8b8b8b8b8b";
const VALID_INPUT = {
  category: "strength",
  template: { en: "Great work on {{metric}} - {{pct}}% this week!", hi: "x", hx: "x" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("createCoachNoteTemplateAction requires coach_note.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: coach_note.manage"));

    const result = await createCoachNoteTemplateAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: coach_note.manage" });
    expect(mockCreateCoachNoteTemplate).not.toHaveBeenCalled();
  });

  it("publishCoachNoteTemplateAction requires coach_note.publish, not coach_note.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: coach_note.publish"));

    const result = await publishCoachNoteTemplateAction({ id: TEMPLATE_ID });

    expect(result).toEqual({ ok: false, error: "Missing permission: coach_note.publish" });
    expect(mockPublishCoachNoteTemplate).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("createCoachNoteTemplateAction creates and revalidates", async () => {
    mockCreateCoachNoteTemplate.mockResolvedValueOnce({ id: "template_1" });

    const result = await createCoachNoteTemplateAction(VALID_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/coach-notes");
  });

  it("createCoachNoteTemplateAction rejects an unknown category", async () => {
    const result = await createCoachNoteTemplateAction({ ...VALID_INPUT, category: "not_a_real_category" });

    expect(result.ok).toBe(false);
    expect(mockCreateCoachNoteTemplate).not.toHaveBeenCalled();
  });

  it("updateCoachNoteTemplateAction updates and revalidates", async () => {
    mockUpdateCoachNoteTemplate.mockResolvedValueOnce({ id: TEMPLATE_ID });

    const result = await updateCoachNoteTemplateAction({ id: TEMPLATE_ID, ...VALID_INPUT });

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/coach-notes");
  });

  it("publishCoachNoteTemplateAction publishes and revalidates", async () => {
    mockPublishCoachNoteTemplate.mockResolvedValueOnce({ id: TEMPLATE_ID, status: "published" });

    const result = await publishCoachNoteTemplateAction({ id: TEMPLATE_ID });

    expect(result).toEqual({ ok: true });
  });

  it("publishCoachNoteTemplateAction surfaces a validation error from the service", async () => {
    mockPublishCoachNoteTemplate.mockRejectedValueOnce(
      new AppError("VALIDATION_FAILED", "Cannot publish: missing template.hi", { missingFields: ["template.hi"] }),
    );

    const result = await publishCoachNoteTemplateAction({ id: TEMPLATE_ID });

    expect(result).toEqual({ ok: false, error: "Cannot publish: missing template.hi" });
  });

  it("unpublishCoachNoteTemplateAction unpublishes and revalidates", async () => {
    mockUnpublishCoachNoteTemplate.mockResolvedValueOnce({ id: TEMPLATE_ID, status: "draft" });

    const result = await unpublishCoachNoteTemplateAction({ id: TEMPLATE_ID });

    expect(result).toEqual({ ok: true });
  });
});
