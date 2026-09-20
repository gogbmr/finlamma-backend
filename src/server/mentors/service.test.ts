import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMentorById = vi.fn();
const mockGetPublishedMentorByKey = vi.fn();
const mockInsertDraftMentor = vi.fn();
const mockListAllMentors = vi.fn();
const mockListPublishedMentors = vi.fn();
const mockPublishMentorRow = vi.fn();
const mockSetMentorArtKey = vi.fn();
const mockUnpublishMentorRow = vi.fn();
const mockUpdateDraftMentor = vi.fn();
vi.mock("./repo", () => ({
  getMentorById: (id: unknown) => mockGetMentorById(id),
  getPublishedMentorByKey: (key: unknown) => mockGetPublishedMentorByKey(key),
  insertDraftMentor: (input: unknown) => mockInsertDraftMentor(input),
  listAllMentors: () => mockListAllMentors(),
  listPublishedMentors: () => mockListPublishedMentors(),
  publishMentorRow: (id: unknown, staffId: unknown) => mockPublishMentorRow(id, staffId),
  setMentorArtKey: (id: unknown, artKey: unknown) => mockSetMentorArtKey(id, artKey),
  unpublishMentorRow: (id: unknown) => mockUnpublishMentorRow(id),
  updateDraftMentor: (input: unknown) => mockUpdateDraftMentor(input),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

const mockGetSignedDownloadUrl = vi.fn();
const mockUploadObject = vi.fn();
vi.mock("@/lib/s3", () => ({
  getSignedDownloadUrl: (key: unknown) => mockGetSignedDownloadUrl(key),
  uploadObject: (key: unknown, body: unknown, contentType: unknown) =>
    mockUploadObject(key, body, contentType),
}));

import {
  createMentorDraft,
  getMentorEditorData,
  getPublicMentorByKey,
  getPublicMentors,
  publishMentor,
  unpublishMentor,
  updateMentorDraft,
  uploadMentorArt,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1" };

function mentorRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mentor_1",
    key: "baby",
    order: 1,
    name: { en: "Baby Lamma", hi: "बेबी लामा", hx: "Baby Lamma" },
    bio: { en: "en bio", hi: "hi bio", hx: "hx bio" },
    worldRangeStart: 1,
    worldRangeEnd: 3,
    artKey: null,
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

describe("getPublicMentors / getPublicMentorByKey", () => {
  it("maps published mentors to the public shape, resolving art via a signed URL", async () => {
    mockListPublishedMentors.mockResolvedValueOnce([mentorRow({ artKey: "mentors/1/art.png" })]);
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/art.png");

    const result = await getPublicMentors();

    expect(result).toEqual([
      {
        key: "baby",
        order: 1,
        name: { en: "Baby Lamma", hi: "बेबी लामा", hx: "Baby Lamma" },
        bio: { en: "en bio", hi: "hi bio", hx: "hx bio" },
        worldRangeStart: 1,
        worldRangeEnd: 3,
        artUrl: "https://signed.example/art.png",
      },
    ]);
  });

  it("returns artUrl: null when no art has been uploaded", async () => {
    mockListPublishedMentors.mockResolvedValueOnce([mentorRow()]);

    const result = await getPublicMentors();

    expect(result[0]!.artUrl).toBeNull();
    expect(mockGetSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown/unpublished key", async () => {
    mockGetPublishedMentorByKey.mockResolvedValueOnce(null);

    await expect(getPublicMentorByKey("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("createMentorDraft", () => {
  it("creates the draft and logs it under the staff actor", async () => {
    mockInsertDraftMentor.mockResolvedValueOnce(mentorRow());

    const input = {
      key: "baby",
      order: 1,
      name: mentorRow().name,
      bio: mentorRow().bio,
      worldRangeStart: 1,
      worldRangeEnd: 3,
    };
    const result = await createMentorDraft(ACTOR, input, META);

    expect(result.id).toBe("mentor_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "staff", actorId: "staff_1", action: "mentor.created" }),
    );
  });

  it("turns a unique-constraint violation into a clear CONFLICT", async () => {
    mockInsertDraftMentor.mockRejectedValueOnce({ code: "23505" });

    await expect(
      createMentorDraft(
        ACTOR,
        { key: "baby", order: 1, name: mentorRow().name, bio: mentorRow().bio, worldRangeStart: 1, worldRangeEnd: 3 },
        META,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("updateMentorDraft", () => {
  it("throws CONFLICT when the mentor is published or missing", async () => {
    mockUpdateDraftMentor.mockResolvedValueOnce(null);

    await expect(
      updateMentorDraft(
        ACTOR,
        { id: "mentor_1", order: 1, name: mentorRow().name, bio: mentorRow().bio, worldRangeStart: 1, worldRangeEnd: 3 },
        META,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("publishMentor - translation-completeness gate", () => {
  it("blocks publish and names every missing field when a language is blank", async () => {
    mockGetMentorById.mockResolvedValueOnce(
      mentorRow({
        name: { en: "Baby Lamma", hi: "", hx: "Baby Lamma" },
        bio: { en: "", hi: "hi bio", hx: "" },
      }),
    );

    await expect(publishMentor(ACTOR, "mentor_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { missingFields: ["name.hi", "bio.en", "bio.hx"] },
    });
    expect(mockPublishMentorRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only field as missing", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow({ name: { en: "  ", hi: "hi", hx: "hx" } }));

    await expect(publishMentor(ACTOR, "mentor_1", META)).rejects.toMatchObject({
      details: { missingFields: ["name.en"] },
    });
  });

  it("publishes and logs it once every field is filled", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    mockPublishMentorRow.mockResolvedValueOnce(mentorRow({ status: "published" }));

    const result = await publishMentor(ACTOR, "mentor_1", META);

    expect(result.status).toBe("published");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mentor.published", actorId: "staff_1" }),
    );
  });

  it("throws NOT_FOUND for an unknown mentor", async () => {
    mockGetMentorById.mockResolvedValueOnce(null);

    await expect(publishMentor(ACTOR, "nope", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the mentor is already published", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow({ status: "published" }));

    await expect(publishMentor(ACTOR, "mentor_1", META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockPublishMentorRow).not.toHaveBeenCalled();
  });
});

describe("unpublishMentor", () => {
  it("unpublishes and logs it", async () => {
    mockUnpublishMentorRow.mockResolvedValueOnce(mentorRow({ status: "draft" }));

    const result = await unpublishMentor(ACTOR, "mentor_1", META);

    expect(result.status).toBe("draft");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mentor.unpublished" }),
    );
  });

  it("throws CONFLICT when the mentor isn't published", async () => {
    mockUnpublishMentorRow.mockResolvedValueOnce(null);

    await expect(unpublishMentor(ACTOR, "mentor_1", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("uploadMentorArt", () => {
  it("uploads to storage, records the key, and logs it", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    mockSetMentorArtKey.mockResolvedValueOnce(mentorRow({ artKey: "mentors/mentor_1/art.png" }));

    const result = await uploadMentorArt(
      ACTOR,
      "mentor_1",
      { body: Buffer.from("x"), contentType: "image/png" },
      META,
    );

    expect(mockUploadObject).toHaveBeenCalledWith(
      "mentors/mentor_1/art.png",
      expect.any(Buffer),
      "image/png",
    );
    expect(result.artKey).toBe("mentors/mentor_1/art.png");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mentor.art_uploaded" }),
    );
  });

  it("throws NOT_FOUND for an unknown mentor", async () => {
    mockGetMentorById.mockResolvedValueOnce(null);

    await expect(
      uploadMentorArt(ACTOR, "nope", { body: Buffer.from("x"), contentType: "image/png" }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });
});

describe("getMentorEditorData", () => {
  it("resolves an artUrl per mentor that has art", async () => {
    mockListAllMentors.mockResolvedValueOnce([
      mentorRow({ id: "m1", artKey: "mentors/m1/art.png" }),
      mentorRow({ id: "m2", artKey: null }),
    ]);
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/m1.png");

    const result = await getMentorEditorData();

    expect(result[0]).toMatchObject({ id: "m1", artUrl: "https://signed.example/m1.png" });
    expect(result[1]).toMatchObject({ id: "m2", artUrl: null });
  });
});
