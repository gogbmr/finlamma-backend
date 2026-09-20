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

const mockCreateMentorDraft = vi.fn();
const mockUpdateMentorDraft = vi.fn();
const mockPublishMentor = vi.fn();
const mockUnpublishMentor = vi.fn();
const mockUploadMentorArt = vi.fn();
vi.mock("@/server/mentors/service", () => ({
  createMentorDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockCreateMentorDraft(actor, input, meta),
  updateMentorDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateMentorDraft(actor, input, meta),
  publishMentor: (actor: unknown, id: unknown, meta: unknown) => mockPublishMentor(actor, id, meta),
  unpublishMentor: (actor: unknown, id: unknown, meta: unknown) =>
    mockUnpublishMentor(actor, id, meta),
  uploadMentorArt: (actor: unknown, id: unknown, file: unknown, meta: unknown) =>
    mockUploadMentorArt(actor, id, file, meta),
}));

import {
  createMentorDraftAction,
  publishMentorAction,
  unpublishMentorAction,
  updateMentorDraftAction,
  uploadMentorArtAction,
} from "./actions";

const ACTOR = { id: "staff_1" };
const MENTOR_ID = "11111111-1111-4111-8111-111111111111";
const VALID_INPUT = {
  key: "baby",
  order: 1,
  name: { en: "Baby Lamma", hi: "बेबी लामा", hx: "Baby Lamma" },
  bio: { en: "en", hi: "hi", hx: "hx" },
  worldRangeStart: 1,
  worldRangeEnd: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("createMentorDraftAction: requires mentor.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: mentor.manage"));

    const result = await createMentorDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: mentor.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("mentor.manage");
    expect(mockCreateMentorDraft).not.toHaveBeenCalled();
  });

  it("updateMentorDraftAction: requires mentor.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: mentor.manage"));

    const result = await updateMentorDraftAction({ id: "m1", ...VALID_INPUT });

    expect(result.ok).toBe(false);
    expect(mockUpdateMentorDraft).not.toHaveBeenCalled();
  });

  it("publishMentorAction: requires mentor.publish, not mentor.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: mentor.publish"));

    const result = await publishMentorAction({ id: MENTOR_ID });

    expect(result.ok).toBe(false);
    expect(mockRequireStaff).toHaveBeenCalledWith("mentor.publish");
    expect(mockPublishMentor).not.toHaveBeenCalled();
  });

  it("unpublishMentorAction: requires mentor.publish", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: mentor.publish"));

    const result = await unpublishMentorAction({ id: MENTOR_ID });

    expect(result.ok).toBe(false);
    expect(mockUnpublishMentor).not.toHaveBeenCalled();
  });

  it("uploadMentorArtAction: requires mentor.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: mentor.manage"));
    const formData = new FormData();
    formData.set("id", MENTOR_ID);
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "art.png", { type: "image/png" }));

    const result = await uploadMentorArtAction(formData);

    expect(result.ok).toBe(false);
    expect(mockUploadMentorArt).not.toHaveBeenCalled();
  });
});

describe("happy paths", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("createMentorDraftAction creates and revalidates", async () => {
    mockCreateMentorDraft.mockResolvedValueOnce({ id: "m1" });

    const result = await createMentorDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockCreateMentorDraft).toHaveBeenCalledWith(ACTOR, VALID_INPUT, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/mentors");
  });

  it("createMentorDraftAction rejects invalid input without calling the service", async () => {
    const result = await createMentorDraftAction({ ...VALID_INPUT, key: "NOT-VALID" });

    expect(result.ok).toBe(false);
    expect(mockCreateMentorDraft).not.toHaveBeenCalled();
  });

  it("publishMentorAction publishes and revalidates", async () => {
    mockPublishMentor.mockResolvedValueOnce({ id: MENTOR_ID, status: "published" });

    const result = await publishMentorAction({ id: MENTOR_ID });

    expect(result).toEqual({ ok: true });
    expect(mockPublishMentor).toHaveBeenCalledWith(ACTOR, MENTOR_ID, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/mentors");
  });

  it("publishMentorAction surfaces a translation-completeness error to the caller", async () => {
    mockPublishMentor.mockRejectedValueOnce(
      new AppError("VALIDATION_FAILED", "Cannot publish: missing translations for bio.hi", {
        missingFields: ["bio.hi"],
      }),
    );

    const result = await publishMentorAction({ id: MENTOR_ID });

    expect(result).toEqual({
      ok: false,
      error: "Cannot publish: missing translations for bio.hi",
    });
  });

  it("uploadMentorArtAction rejects a non-image content type", async () => {
    const formData = new FormData();
    formData.set("id", MENTOR_ID);
    formData.set("file", new File([new Uint8Array([1])], "art.gif", { type: "image/gif" }));

    const result = await uploadMentorArtAction(formData);

    expect(result.ok).toBe(false);
    expect(mockUploadMentorArt).not.toHaveBeenCalled();
  });

  it("uploadMentorArtAction uploads a valid PNG", async () => {
    mockUploadMentorArt.mockResolvedValueOnce({ id: MENTOR_ID, artKey: `mentors/${MENTOR_ID}/art.png` });
    const formData = new FormData();
    formData.set("id", MENTOR_ID);
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "art.png", { type: "image/png" }));

    const result = await uploadMentorArtAction(formData);

    expect(result).toEqual({ ok: true });
    expect(mockUploadMentorArt).toHaveBeenCalledWith(
      ACTOR,
      MENTOR_ID,
      expect.objectContaining({ contentType: "image/png" }),
      expect.any(Object),
    );
  });
});
