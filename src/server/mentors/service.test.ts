import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMentorById = vi.fn();
const mockGetPublishedMentorByKey = vi.fn();
const mockHotfixMentorRow = vi.fn();
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
  hotfixMentorRow: (input: unknown) => mockHotfixMentorRow(input),
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

const mockListPublishedWorldsByMentorId = vi.fn();
const mockListAllWorlds = vi.fn();
vi.mock("@/server/worlds/repo", () => ({
  listPublishedWorldsByMentorId: (mentorId: unknown) => mockListPublishedWorldsByMentorId(mentorId),
  listAllWorlds: () => mockListAllWorlds(),
}));

const mockGetSignedDownloadUrl = vi.fn();
const mockUploadObject = vi.fn();
vi.mock("@/lib/s3", () => ({
  getSignedDownloadUrl: (key: unknown) => mockGetSignedDownloadUrl(key),
  uploadObject: (key: unknown, body: unknown, contentType: unknown) =>
    mockUploadObject(key, body, contentType),
}));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) =>
    mockRoleHasPermission(roleId, permission),
}));

import {
  createMentorDraft,
  getMentorEditorData,
  getPublicMentorByKey,
  getPublicMentors,
  hotfixMentor,
  publishMentor,
  unpublishMentor,
  updateMentorDraft,
  uploadMentorArt,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1", roleId: "role_1" };

function mentorRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mentor_1",
    key: "baby",
    order: 1,
    name: { en: "Baby Lamma", hi: "बेबी लामा", hx: "Baby Lamma" },
    bio: { en: "en bio", hi: "hi bio", hx: "hx bio" },
    persona: "test persona",
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
  // No published worlds reference this mentor by default - existing tests
  // below don't need to know about the world-reference block at all.
  mockListPublishedWorldsByMentorId.mockResolvedValue([]);
  mockListAllWorlds.mockResolvedValue([]);
  // Actor has every permission by default - existing tests below don't
  // need to know about the art-upload permission-tier check at all.
  mockRoleHasPermission.mockResolvedValue(true);
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
      persona: "test persona",
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
        { key: "baby", order: 1, name: mentorRow().name, bio: mentorRow().bio, persona: "test persona" },
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
        { id: "mentor_1", order: 1, name: mentorRow().name, bio: mentorRow().bio, persona: "test persona" },
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

// D20 (docs/ARCHITECTURE.md): direct edit of a PUBLISHED mentor's name/bio,
// without unpublishing.
describe("hotfixMentor", () => {
  const HOTFIX_INPUT = {
    id: "mentor_1",
    name: { en: "Fixed name", hi: "x", hx: "x" },
    bio: { en: "Fixed bio.", hi: "x", hx: "x" },
  };

  it("updates a published mentor and logs it", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow({ status: "published" }));
    mockHotfixMentorRow.mockResolvedValueOnce(mentorRow({ status: "published", ...HOTFIX_INPUT }));

    const result = await hotfixMentor(ACTOR, HOTFIX_INPUT, META);

    expect(result.name.en).toBe("Fixed name");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mentor.hotfixed", actorId: "staff_1" }),
    );
  });

  it("throws NOT_FOUND for an unknown mentor", async () => {
    mockGetMentorById.mockResolvedValueOnce(null);

    await expect(hotfixMentor(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockHotfixMentorRow).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when the mentor is a draft, not published", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow({ status: "draft" }));

    await expect(hotfixMentor(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mockHotfixMentorRow).not.toHaveBeenCalled();
  });

  it("rejects a fix that leaves a translation missing", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow({ status: "published" }));

    await expect(
      hotfixMentor(ACTOR, { ...HOTFIX_INPUT, name: { en: "Fixed", hi: "", hx: "Fixed" } }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockHotfixMentorRow).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when the repo returns null (concurrently unpublished)", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow({ status: "published" }));
    mockHotfixMentorRow.mockResolvedValueOnce(null);

    await expect(hotfixMentor(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
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

  // The rule this checkpoint added: a mentor can't be unpublished while any
  // published world still references it, naming the world in the error.
  it("blocks unpublish and names the referencing world when a published world still uses this mentor", async () => {
    mockListPublishedWorldsByMentorId.mockResolvedValueOnce([
      { id: "world_1", title: { en: "Money World", hi: "x", hx: "x" } },
    ]);

    await expect(unpublishMentor(ACTOR, "mentor_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/Money World/),
      details: { worldIds: ["world_1"] },
    });
    expect(mockUnpublishMentorRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("names every referencing world when more than one published world uses this mentor", async () => {
    mockListPublishedWorldsByMentorId.mockResolvedValueOnce([
      { id: "world_1", title: { en: "Money World", hi: "x", hx: "x" } },
      { id: "world_2", title: { en: "Savings Valley", hi: "x", hx: "x" } },
    ]);

    await expect(unpublishMentor(ACTOR, "mentor_1", META)).rejects.toMatchObject({
      message: expect.stringMatching(/Money World.*Savings Valley/),
    });
  });

  it("allows unpublish once no published world references the mentor anymore", async () => {
    mockListPublishedWorldsByMentorId.mockResolvedValueOnce([]);
    mockUnpublishMentorRow.mockResolvedValueOnce(mentorRow({ status: "draft" }));

    const result = await unpublishMentor(ACTOR, "mentor_1", META);

    expect(result.status).toBe("draft");
  });
});

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from("WEBP", "ascii"),
]);

describe("uploadMentorArt", () => {
  it("uploads to storage under a server-generated, unique key, records old+new keys, and logs it", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow({ artKey: "mentors/mentor_1/old-key.png" }));
    mockSetMentorArtKey.mockResolvedValueOnce(mentorRow({ artKey: "mentors/mentor_1/new-key.png" }));

    const result = await uploadMentorArt(ACTOR, "mentor_1", { body: PNG_BYTES }, META);

    expect(mockUploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^mentors\/mentor_1\/[0-9a-f-]+\.png$/),
      PNG_BYTES,
      "image/png",
    );
    expect(result.artKey).toBe("mentors/mentor_1/new-key.png");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mentor.art_uploaded",
        metadata: expect.objectContaining({
          previousArtKey: "mentors/mentor_1/old-key.png",
          newArtKey: expect.stringMatching(/^mentors\/mentor_1\/[0-9a-f-]+\.png$/),
        }),
      }),
    );
  });

  it("never reuses the previous art's key - the old object is never overwritten or deleted", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow({ artKey: "mentors/mentor_1/old-key.png" }));
    mockSetMentorArtKey.mockResolvedValueOnce(mentorRow());

    await uploadMentorArt(ACTOR, "mentor_1", { body: PNG_BYTES }, META);

    const [uploadedKey] = mockUploadObject.mock.calls[0]!;
    expect(uploadedKey).not.toBe("mentors/mentor_1/old-key.png");
  });

  it("derives the storage content-type from sniffed bytes, not any client-supplied label", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    mockSetMentorArtKey.mockResolvedValueOnce(mentorRow({ artKey: "mentors/mentor_1/art.webp" }));

    await uploadMentorArt(ACTOR, "mentor_1", { body: WEBP_BYTES }, META);

    expect(mockUploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^mentors\/mentor_1\/[0-9a-f-]+\.webp$/),
      WEBP_BYTES,
      "image/webp",
    );
  });

  it("rejects a file whose bytes aren't a real PNG/JPEG/WebP - e.g. an SVG renamed to look like one", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    const svgDisguisedAsImage = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "utf8",
    );

    await expect(
      uploadMentorArt(ACTOR, "mentor_1", { body: svgDisguisedAsImage }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUploadObject).not.toHaveBeenCalled();
    expect(mockSetMentorArtKey).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("rejects a file over the 2MB cap even if the bytes are a real PNG", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024)]);

    await expect(
      uploadMentorArt(ACTOR, "mentor_1", { body: oversized }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown mentor", async () => {
    mockGetMentorById.mockResolvedValueOnce(null);

    await expect(
      uploadMentorArt(ACTOR, "nope", { body: PNG_BYTES }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  // D20/D25 (docs/ARCHITECTURE.md): a published mentor's art is live content
  // - replacing it needs mentor.publish, the same trust bar as the name/bio
  // hotfix path, not just mentor.manage. A draft's art is normal editing.
  describe("permission tier depends on the mentor's status", () => {
    it("allows a draft upload for an actor with only mentor.manage", async () => {
      mockGetMentorById.mockResolvedValueOnce(mentorRow({ status: "draft" }));
      mockRoleHasPermission.mockImplementation((_roleId: string, perm: string) =>
        Promise.resolve(perm === "mentor.manage"),
      );
      mockSetMentorArtKey.mockResolvedValueOnce(mentorRow());

      await expect(
        uploadMentorArt(ACTOR, "mentor_1", { body: PNG_BYTES }, META),
      ).resolves.toBeDefined();
    });

    it("blocks a published-mentor upload for an actor with only mentor.manage", async () => {
      mockGetMentorById.mockResolvedValueOnce(mentorRow({ status: "published" }));
      mockRoleHasPermission.mockImplementation((_roleId: string, perm: string) =>
        Promise.resolve(perm === "mentor.manage"),
      );

      await expect(
        uploadMentorArt(ACTOR, "mentor_1", { body: PNG_BYTES }, META),
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/mentor\.publish/) });
      expect(mockUploadObject).not.toHaveBeenCalled();
      expect(mockLogActivity).not.toHaveBeenCalled();
    });

    it("allows a published-mentor upload for an actor with mentor.publish", async () => {
      mockGetMentorById.mockResolvedValueOnce(mentorRow({ status: "published" }));
      mockRoleHasPermission.mockImplementation((_roleId: string, perm: string) =>
        Promise.resolve(perm === "mentor.publish"),
      );
      mockSetMentorArtKey.mockResolvedValueOnce(mentorRow({ status: "published" }));

      await expect(
        uploadMentorArt(ACTOR, "mentor_1", { body: PNG_BYTES }, META),
      ).resolves.toBeDefined();
    });
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

  // D25 (docs/ARCHITECTURE.md): usedByWorlds is computed from worlds.mentorId,
  // never a stored range on the mentor - a mentor can be used by any number
  // of worlds, including more than one. Batched via one listAllWorlds() call
  // + an in-memory group-by (not one query per mentor) - this test also
  // covers that a mentor's worlds are correctly isolated from another
  // mentor's, not just concatenated.
  it("attaches usedByWorlds computed from worlds.mentorId, including when shared by several worlds", async () => {
    mockListAllMentors.mockResolvedValueOnce([
      mentorRow({ id: "m1" }),
      mentorRow({ id: "m2", key: "other" }),
    ]);
    mockListAllWorlds.mockResolvedValueOnce([
      { id: "w1", title: { en: "World One" }, status: "published", mentorId: "m1" },
      { id: "w2", title: { en: "World Two" }, status: "draft", mentorId: "m1" },
      { id: "w3", title: { en: "World Three" }, status: "published", mentorId: "m2" },
    ]);

    const result = await getMentorEditorData();

    expect(result[0]!.usedByWorlds).toEqual([
      { id: "w1", title: { en: "World One" }, status: "published" },
      { id: "w2", title: { en: "World Two" }, status: "draft" },
    ]);
    expect(result[1]!.usedByWorlds).toEqual([
      { id: "w3", title: { en: "World Three" }, status: "published" },
    ]);
  });

  it("returns usedByWorlds: [] for a mentor no world references yet", async () => {
    mockListAllMentors.mockResolvedValueOnce([mentorRow({ id: "m1" })]);
    mockListAllWorlds.mockResolvedValueOnce([]);

    const result = await getMentorEditorData();

    expect(result[0]!.usedByWorlds).toEqual([]);
  });

  it("fetches worlds once regardless of how many mentors there are, not once per mentor", async () => {
    mockListAllMentors.mockResolvedValueOnce([
      mentorRow({ id: "m1" }),
      mentorRow({ id: "m2", key: "b" }),
      mentorRow({ id: "m3", key: "c" }),
    ]);
    mockListAllWorlds.mockResolvedValueOnce([]);

    await getMentorEditorData();

    expect(mockListAllWorlds).toHaveBeenCalledTimes(1);
  });
});
