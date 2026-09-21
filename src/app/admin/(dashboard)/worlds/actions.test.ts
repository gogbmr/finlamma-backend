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

const mockCreateWorldDraft = vi.fn();
const mockUpdateWorldDraft = vi.fn();
const mockPublishWorld = vi.fn();
const mockUnpublishWorld = vi.fn();
const mockUploadWorldArt = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  createWorldDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockCreateWorldDraft(actor, input, meta),
  updateWorldDraft: (actor: unknown, input: unknown, meta: unknown) =>
    mockUpdateWorldDraft(actor, input, meta),
  publishWorld: (actor: unknown, id: unknown, meta: unknown) => mockPublishWorld(actor, id, meta),
  unpublishWorld: (actor: unknown, id: unknown, meta: unknown) =>
    mockUnpublishWorld(actor, id, meta),
  uploadWorldArt: (actor: unknown, id: unknown, file: unknown, meta: unknown) =>
    mockUploadWorldArt(actor, id, file, meta),
}));

import {
  createWorldDraftAction,
  publishWorldAction,
  unpublishWorldAction,
  updateWorldDraftAction,
  uploadWorldArtAction,
} from "./actions";

const ACTOR = { id: "staff_1" };
const WORLD_ID = "11111111-1111-4111-8111-111111111111";
const MENTOR_ID = "22222222-2222-4222-8222-222222222222";
const VALID_INPUT = {
  order: 1,
  title: { en: "Money World", hi: "मनी वर्ल्ड", hx: "Money World" },
  tagline: { en: "en", hi: "hi", hx: "hx" },
  theme: "#7C3AED",
  displayXpTarget: 5,
  mentorId: MENTOR_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("wrong role is rejected", () => {
  it("createWorldDraftAction: requires world.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: world.manage"));

    const result = await createWorldDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: "Missing permission: world.manage" });
    expect(mockRequireStaff).toHaveBeenCalledWith("world.manage");
    expect(mockCreateWorldDraft).not.toHaveBeenCalled();
  });

  it("updateWorldDraftAction: requires world.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: world.manage"));

    const result = await updateWorldDraftAction({ id: WORLD_ID, ...VALID_INPUT });

    expect(result.ok).toBe(false);
    expect(mockUpdateWorldDraft).not.toHaveBeenCalled();
  });

  it("publishWorldAction: requires world.publish, not world.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: world.publish"));

    const result = await publishWorldAction({ id: WORLD_ID });

    expect(result.ok).toBe(false);
    expect(mockRequireStaff).toHaveBeenCalledWith("world.publish");
    expect(mockPublishWorld).not.toHaveBeenCalled();
  });

  it("unpublishWorldAction: requires world.publish", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: world.publish"));

    const result = await unpublishWorldAction({ id: WORLD_ID });

    expect(result.ok).toBe(false);
    expect(mockUnpublishWorld).not.toHaveBeenCalled();
  });

  it("uploadWorldArtAction: requires world.manage", async () => {
    mockRequireStaff.mockRejectedValueOnce(new AppError("FORBIDDEN", "Missing permission: world.manage"));
    const formData = new FormData();
    formData.set("id", WORLD_ID);
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "art.png", { type: "image/png" }));

    const result = await uploadWorldArtAction(formData);

    expect(result.ok).toBe(false);
    expect(mockUploadWorldArt).not.toHaveBeenCalled();
  });
});

describe("happy paths", () => {
  beforeEach(() => {
    mockRequireStaff.mockResolvedValue(ACTOR);
  });

  it("createWorldDraftAction creates and revalidates", async () => {
    mockCreateWorldDraft.mockResolvedValueOnce({ id: WORLD_ID });

    const result = await createWorldDraftAction(VALID_INPUT);

    expect(result).toEqual({ ok: true });
    expect(mockCreateWorldDraft).toHaveBeenCalledWith(ACTOR, VALID_INPUT, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/worlds");
  });

  it("createWorldDraftAction rejects invalid input (bad mentorId) without calling the service", async () => {
    const result = await createWorldDraftAction({ ...VALID_INPUT, mentorId: "not-a-uuid" });

    expect(result.ok).toBe(false);
    expect(mockCreateWorldDraft).not.toHaveBeenCalled();
  });

  it("publishWorldAction publishes and revalidates", async () => {
    mockPublishWorld.mockResolvedValueOnce({ id: WORLD_ID, status: "published" });

    const result = await publishWorldAction({ id: WORLD_ID });

    expect(result).toEqual({ ok: true });
    expect(mockPublishWorld).toHaveBeenCalledWith(ACTOR, WORLD_ID, expect.any(Object));
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/worlds");
  });

  it("publishWorldAction surfaces the mentor-not-published error to the caller", async () => {
    mockPublishWorld.mockRejectedValueOnce(
      new AppError("CONFLICT", 'Cannot publish: mentor "Father Lamma" is not published yet'),
    );

    const result = await publishWorldAction({ id: WORLD_ID });

    expect(result).toEqual({
      ok: false,
      error: 'Cannot publish: mentor "Father Lamma" is not published yet',
    });
  });

  it("unpublishWorldAction unpublishes and revalidates", async () => {
    mockUnpublishWorld.mockResolvedValueOnce({ id: WORLD_ID, status: "draft" });

    const result = await unpublishWorldAction({ id: WORLD_ID });

    expect(result).toEqual({ ok: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/worlds");
  });

  it("uploadWorldArtAction rejects when no file is provided, without calling the service", async () => {
    const formData = new FormData();
    formData.set("id", WORLD_ID);

    const result = await uploadWorldArtAction(formData);

    expect(result.ok).toBe(false);
    expect(mockUploadWorldArt).not.toHaveBeenCalled();
  });

  it("uploadWorldArtAction reads the raw file bytes and passes them through, ignoring the client's declared type", async () => {
    mockUploadWorldArt.mockResolvedValueOnce({ id: WORLD_ID, artKey: `worlds/${WORLD_ID}/art.png` });
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const formData = new FormData();
    formData.set("id", WORLD_ID);
    formData.set("file", new File([bytes], "art.gif", { type: "image/gif" }));

    const result = await uploadWorldArtAction(formData);

    expect(result).toEqual({ ok: true });
    expect(mockUploadWorldArt).toHaveBeenCalledWith(
      ACTOR,
      WORLD_ID,
      { body: Buffer.from(bytes) },
      expect.any(Object),
    );
  });
});
