import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetWorldById = vi.fn();
const mockInsertDraftWorld = vi.fn();
const mockListAllWorlds = vi.fn();
const mockListPublishedWorlds = vi.fn();
const mockMoveWorldToPosition = vi.fn();
const mockPublishWorldRow = vi.fn();
const mockSetWorldArtKey = vi.fn();
const mockUnpublishWorldRow = vi.fn();
const mockUpdateDraftWorld = vi.fn();
vi.mock("./repo", () => ({
  getWorldById: (id: unknown) => mockGetWorldById(id),
  insertDraftWorld: (input: unknown) => mockInsertDraftWorld(input),
  listAllWorlds: () => mockListAllWorlds(),
  listPublishedWorlds: () => mockListPublishedWorlds(),
  moveWorldToPosition: (id: unknown, newOrder: unknown) => mockMoveWorldToPosition(id, newOrder),
  publishWorldRow: (id: unknown, staffId: unknown) => mockPublishWorldRow(id, staffId),
  setWorldArtKey: (id: unknown, artKey: unknown) => mockSetWorldArtKey(id, artKey),
  unpublishWorldRow: (id: unknown) => mockUnpublishWorldRow(id),
  updateDraftWorld: (input: unknown) => mockUpdateDraftWorld(input),
}));

const mockGetMentorById = vi.fn();
const mockListAllMentors = vi.fn();
vi.mock("@/server/mentors/repo", () => ({
  getMentorById: (id: unknown) => mockGetMentorById(id),
  listAllMentors: () => mockListAllMentors(),
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
  createWorldDraft,
  getPublicWorlds,
  getWorldEditorData,
  publishWorld,
  reorderWorld,
  unpublishWorld,
  updateWorldDraft,
  uploadWorldArt,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1" };
const MENTOR_ID = "mentor_1";

function worldRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "world_1",
    order: 1,
    title: { en: "Money World", hi: "मनी वर्ल्ड", hx: "Money World" },
    tagline: { en: "en tagline", hi: "hi tagline", hx: "hx tagline" },
    theme: "#7C3AED",
    displayXpTarget: 5,
    artKey: null,
    mentorId: MENTOR_ID,
    status: "draft" as const,
    publishedAt: null,
    publishedBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function mentorRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MENTOR_ID,
    key: "baby",
    name: { en: "Baby Lamma", hi: "बेबी लामा", hx: "Baby Lamma" },
    status: "published" as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicWorlds", () => {
  it("maps published worlds to the public shape, resolving art and mentor key", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow({ artKey: "worlds/1/art.png" })]);
    mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/art.png");

    const result = await getPublicWorlds();

    expect(result).toEqual([
      {
        order: 1,
        title: { en: "Money World", hi: "मनी वर्ल्ड", hx: "Money World" },
        tagline: { en: "en tagline", hi: "hi tagline", hx: "hx tagline" },
        theme: "#7C3AED",
        displayXpTarget: 5,
        artUrl: "https://signed.example/art.png",
        mentorKey: "baby",
      },
    ]);
  });

  it("returns artUrl: null when no art has been uploaded", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
    mockListAllMentors.mockResolvedValueOnce([mentorRow()]);

    const result = await getPublicWorlds();

    expect(result[0]!.artUrl).toBeNull();
    expect(mockGetSignedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe("createWorldDraft", () => {
  it("creates the draft and logs it, after confirming the mentor exists", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    mockInsertDraftWorld.mockResolvedValueOnce(worldRow());

    const input = {
      order: 1,
      title: worldRow().title,
      tagline: worldRow().tagline,
      theme: "#7C3AED",
      displayXpTarget: 5,
      mentorId: MENTOR_ID,
    };
    const result = await createWorldDraft(ACTOR, input, META);

    expect(result.id).toBe("world_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "staff", actorId: "staff_1", action: "world.created" }),
    );
  });

  it("throws NOT_FOUND when the mentor doesn't exist, without creating the world", async () => {
    mockGetMentorById.mockResolvedValueOnce(null);

    await expect(
      createWorldDraft(
        ACTOR,
        {
          order: 1,
          title: worldRow().title,
          tagline: worldRow().tagline,
          theme: "#7C3AED",
          displayXpTarget: 5,
          mentorId: "nope",
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockInsertDraftWorld).not.toHaveBeenCalled();
  });

  it("turns a unique-constraint violation (duplicate order) into a clear CONFLICT", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    mockInsertDraftWorld.mockRejectedValueOnce({ code: "23505" });

    await expect(
      createWorldDraft(
        ACTOR,
        {
          order: 1,
          title: worldRow().title,
          tagline: worldRow().tagline,
          theme: "#7C3AED",
          displayXpTarget: 5,
          mentorId: MENTOR_ID,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("updateWorldDraft", () => {
  it("throws CONFLICT when the world is published or missing", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    mockUpdateDraftWorld.mockResolvedValueOnce(null);

    await expect(
      updateWorldDraft(
        ACTOR,
        {
          id: "world_1",
          order: 1,
          title: worldRow().title,
          tagline: worldRow().tagline,
          theme: "#7C3AED",
          displayXpTarget: 5,
          mentorId: MENTOR_ID,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when reassigned to a nonexistent mentor", async () => {
    mockGetMentorById.mockResolvedValueOnce(null);

    await expect(
      updateWorldDraft(
        ACTOR,
        {
          id: "world_1",
          order: 1,
          title: worldRow().title,
          tagline: worldRow().tagline,
          theme: "#7C3AED",
          displayXpTarget: 5,
          mentorId: "nope",
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockUpdateDraftWorld).not.toHaveBeenCalled();
  });
});

describe("reorderWorld", () => {
  it("moves the world and logs it, once newOrder is within range", async () => {
    mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow(), worldRow()]); // count: 3
    mockMoveWorldToPosition.mockResolvedValueOnce(worldRow({ order: 2 }));

    const result = await reorderWorld(ACTOR, "world_1", 2, META);

    expect(mockMoveWorldToPosition).toHaveBeenCalledWith("world_1", 2);
    expect(result.order).toBe(2);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "world.reordered", actorId: "staff_1" }),
    );
  });

  it("rejects newOrder below 1 without calling the repo", async () => {
    mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow(), worldRow()]);

    await expect(reorderWorld(ACTOR, "world_1", 0, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockMoveWorldToPosition).not.toHaveBeenCalled();
  });

  it("rejects newOrder beyond the current world count without calling the repo", async () => {
    mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow(), worldRow()]); // count: 3

    await expect(reorderWorld(ACTOR, "world_1", 4, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockMoveWorldToPosition).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown world", async () => {
    mockListAllWorlds.mockResolvedValueOnce([worldRow()]);
    mockMoveWorldToPosition.mockResolvedValueOnce(null);

    await expect(reorderWorld(ACTOR, "nope", 1, META)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("publishWorld", () => {
  it("blocks publish and names every missing field when a language is blank", async () => {
    mockGetWorldById.mockResolvedValueOnce(
      worldRow({
        title: { en: "Money World", hi: "", hx: "Money World" },
        tagline: { en: "", hi: "hi tagline", hx: "" },
      }),
    );

    await expect(publishWorld(ACTOR, "world_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { missingFields: ["title.hi", "tagline.en", "tagline.hx"] },
    });
    expect(mockPublishWorldRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown world", async () => {
    mockGetWorldById.mockResolvedValueOnce(null);

    await expect(publishWorld(ACTOR, "nope", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the world is already published", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "published" }));

    await expect(publishWorld(ACTOR, "world_1", META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockPublishWorldRow).not.toHaveBeenCalled();
  });

  // The rule this checkpoint added: a world can't be published unless its
  // mentor already is - a learner reaching this world must always have a
  // real mentor to meet.
  it("blocks publish when the world's mentor is not published yet", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockGetMentorById.mockResolvedValueOnce(mentorRow({ status: "draft" }));

    await expect(publishWorld(ACTOR, "world_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/mentor.*not published/i),
    });
    expect(mockPublishWorldRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("publishes and logs it once translations are complete and the mentor is published", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    mockPublishWorldRow.mockResolvedValueOnce(worldRow({ status: "published" }));

    const result = await publishWorld(ACTOR, "world_1", META);

    expect(result.status).toBe("published");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "world.published", actorId: "staff_1" }),
    );
  });
});

describe("unpublishWorld", () => {
  it("unpublishes and logs it", async () => {
    mockUnpublishWorldRow.mockResolvedValueOnce(worldRow({ status: "draft" }));

    const result = await unpublishWorld(ACTOR, "world_1", META);

    expect(result.status).toBe("draft");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "world.unpublished" }),
    );
  });

  it("throws CONFLICT when the world isn't published", async () => {
    mockUnpublishWorldRow.mockResolvedValueOnce(null);

    await expect(unpublishWorld(ACTOR, "world_1", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("uploadWorldArt", () => {
  it("uploads to storage under a server-generated key, records it, and logs it", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockSetWorldArtKey.mockResolvedValueOnce(worldRow({ artKey: "worlds/world_1/art.png" }));

    const result = await uploadWorldArt(ACTOR, "world_1", { body: PNG_BYTES }, META);

    expect(mockUploadObject).toHaveBeenCalledWith("worlds/world_1/art.png", PNG_BYTES, "image/png");
    expect(result.artKey).toBe("worlds/world_1/art.png");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "world.art_uploaded" }),
    );
  });

  it("rejects a file whose bytes aren't a real PNG/JPEG/WebP", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    const svgDisguisedAsImage = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "utf8",
    );

    await expect(
      uploadWorldArt(ACTOR, "world_1", { body: svgDisguisedAsImage }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("rejects a file over the 2MB cap", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024)]);

    await expect(
      uploadWorldArt(ACTOR, "world_1", { body: oversized }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown world", async () => {
    mockGetWorldById.mockResolvedValueOnce(null);

    await expect(
      uploadWorldArt(ACTOR, "nope", { body: PNG_BYTES }, META),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockUploadObject).not.toHaveBeenCalled();
  });
});

describe("getWorldEditorData", () => {
  it("resolves an artUrl per world that has art", async () => {
    mockListAllWorlds.mockResolvedValueOnce([
      worldRow({ id: "w1", artKey: "worlds/w1/art.png" }),
      worldRow({ id: "w2", artKey: null }),
    ]);
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/w1.png");

    const result = await getWorldEditorData();

    expect(result[0]).toMatchObject({ id: "w1", artUrl: "https://signed.example/w1.png" });
    expect(result[1]).toMatchObject({ id: "w2", artUrl: null });
  });
});
