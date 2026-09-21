import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetWorldById = vi.fn();
const mockHotfixWorldRow = vi.fn();
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
  hotfixWorldRow: (input: unknown) => mockHotfixWorldRow(input),
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

const mockListPublishedLessonsByWorldId = vi.fn();
vi.mock("@/server/lessons/repo", () => ({
  listPublishedLessonsByWorldId: (worldId: unknown) => mockListPublishedLessonsByWorldId(worldId),
}));

const mockGetWorldIdsWithCompletedBossQuiz = vi.fn();
vi.mock("@/server/lesson-progress/repo", () => ({
  getWorldIdsWithCompletedBossQuiz: (userId: unknown) => mockGetWorldIdsWithCompletedBossQuiz(userId),
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
  hotfixWorld,
  publishWorld,
  reorderWorld,
  unpublishWorld,
  updateWorldDraft,
  uploadWorldArt,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1" };
const MENTOR_ID = "mentor_1";
const USER_ID = "user_1";

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
  // No published lessons reference this world by default - existing tests
  // below don't need to know about the lesson-reference block at all.
  mockListPublishedLessonsByWorldId.mockResolvedValue([]);
  // No cleared worlds by default - existing getPublicWorlds tests below
  // don't need to know about the unlock check at all.
  mockGetWorldIdsWithCompletedBossQuiz.mockResolvedValue(new Set());
});

describe("getPublicWorlds", () => {
  it("maps published worlds to the public shape, resolving art and mentor key", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow({ artKey: "worlds/1/art.png" })]);
    mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
    mockGetSignedDownloadUrl.mockResolvedValueOnce("https://signed.example/art.png");

    const result = await getPublicWorlds(USER_ID);

    expect(result).toEqual([
      {
        order: 1,
        title: { en: "Money World", hi: "मनी वर्ल्ड", hx: "Money World" },
        tagline: { en: "en tagline", hi: "hi tagline", hx: "hx tagline" },
        theme: "#7C3AED",
        displayXpTarget: 5,
        artUrl: "https://signed.example/art.png",
        mentorKey: "baby",
        locked: false,
      },
    ]);
  });

  it("returns artUrl: null when no art has been uploaded", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
    mockListAllMentors.mockResolvedValueOnce([mentorRow()]);

    const result = await getPublicWorlds(USER_ID);

    expect(result[0]!.artUrl).toBeNull();
    expect(mockGetSignedDownloadUrl).not.toHaveBeenCalled();
  });

  // Sequential unlock only (docs/ARCHITECTURE.md D23) - never an XP/level
  // gate, never based on displayXpTarget.
  describe("sequential unlock", () => {
    it("the first (lowest-order) world is always unlocked, regardless of progress", async () => {
      mockListPublishedWorlds.mockResolvedValueOnce([worldRow({ id: "world_1", order: 1 })]);
      mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
      mockGetWorldIdsWithCompletedBossQuiz.mockResolvedValueOnce(new Set());

      const result = await getPublicWorlds(USER_ID);

      expect(result[0]!.locked).toBe(false);
    });

    it("locks the second world until the first world's Boss Quiz is completed", async () => {
      mockListPublishedWorlds.mockResolvedValueOnce([
        worldRow({ id: "world_1", order: 1 }),
        worldRow({ id: "world_2", order: 2 }),
      ]);
      mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
      mockGetWorldIdsWithCompletedBossQuiz.mockResolvedValueOnce(new Set()); // nothing cleared yet

      const result = await getPublicWorlds(USER_ID);

      expect(result[0]!.locked).toBe(false);
      expect(result[1]!.locked).toBe(true);
    });

    it("unlocks the second world once the first world's Boss Quiz is completed", async () => {
      mockListPublishedWorlds.mockResolvedValueOnce([
        worldRow({ id: "world_1", order: 1 }),
        worldRow({ id: "world_2", order: 2 }),
      ]);
      mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
      mockGetWorldIdsWithCompletedBossQuiz.mockResolvedValueOnce(new Set(["world_1"]));

      const result = await getPublicWorlds(USER_ID);

      expect(result[0]!.locked).toBe(false);
      expect(result[1]!.locked).toBe(false);
    });

    it("stays sequential: clearing world 1 does not unlock world 3 while world 2 is still uncleared", async () => {
      mockListPublishedWorlds.mockResolvedValueOnce([
        worldRow({ id: "world_1", order: 1 }),
        worldRow({ id: "world_2", order: 2 }),
        worldRow({ id: "world_3", order: 3 }),
      ]);
      mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
      mockGetWorldIdsWithCompletedBossQuiz.mockResolvedValueOnce(new Set(["world_1"]));

      const result = await getPublicWorlds(USER_ID);

      expect(result[1]!.locked).toBe(false); // world 2: previous (world 1) cleared
      expect(result[2]!.locked).toBe(true); // world 3: previous (world 2) NOT cleared
    });

    it("passes the caller's userId through to the progress check", async () => {
      mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
      mockListAllMentors.mockResolvedValueOnce([mentorRow()]);

      await getPublicWorlds(USER_ID);

      expect(mockGetWorldIdsWithCompletedBossQuiz).toHaveBeenCalledWith(USER_ID);
    });
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

  it.each([["serialization failure", "40001"], ["deadlock", "40P01"]])(
    "maps a genuine concurrent-transaction conflict (%s) to a clean, retryable CONFLICT",
    async (_label, code) => {
      mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow()]);
      mockMoveWorldToPosition.mockRejectedValueOnce({ code });

      await expect(reorderWorld(ACTOR, "world_1", 2, META)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(mockLogActivity).not.toHaveBeenCalled();
    },
  );

  it("re-throws an unrelated error instead of misreporting it as a reorder conflict", async () => {
    mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow()]);
    mockMoveWorldToPosition.mockRejectedValueOnce(new Error("something else entirely"));

    await expect(reorderWorld(ACTOR, "world_1", 2, META)).rejects.toThrow("something else entirely");
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

// D20 (docs/ARCHITECTURE.md): direct edit of a PUBLISHED world's
// title/tagline, without unpublishing.
describe("hotfixWorld", () => {
  const HOTFIX_INPUT = {
    id: "world_1",
    title: { en: "Fixed title", hi: "x", hx: "x" },
    tagline: { en: "Fixed tagline.", hi: "x", hx: "x" },
  };

  it("updates a published world and logs it", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "published" }));
    mockHotfixWorldRow.mockResolvedValueOnce(worldRow({ status: "published", ...HOTFIX_INPUT }));

    const result = await hotfixWorld(ACTOR, HOTFIX_INPUT, META);

    expect(result.title.en).toBe("Fixed title");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "world.hotfixed", actorId: "staff_1" }),
    );
  });

  it("throws NOT_FOUND for an unknown world", async () => {
    mockGetWorldById.mockResolvedValueOnce(null);

    await expect(hotfixWorld(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockHotfixWorldRow).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when the world is a draft, not published", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "draft" }));

    await expect(hotfixWorld(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mockHotfixWorldRow).not.toHaveBeenCalled();
  });

  it("rejects a fix that leaves a translation missing", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "published" }));

    await expect(
      hotfixWorld(ACTOR, { ...HOTFIX_INPUT, title: { en: "Fixed", hi: "", hx: "Fixed" } }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockHotfixWorldRow).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when the repo returns null (concurrently unpublished)", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "published" }));
    mockHotfixWorldRow.mockResolvedValueOnce(null);

    await expect(hotfixWorld(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
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

  // The rule this checkpoint added: a world can't be unpublished while any
  // published lesson still belongs to it, naming the lesson(s) in the error.
  it("blocks unpublish and names the referencing lesson when a published lesson still belongs to this world", async () => {
    mockListPublishedLessonsByWorldId.mockResolvedValueOnce([
      { id: "lesson_1", title: { en: "Money World Lesson", hi: "x", hx: "x" }, chapter: 1, step: 1 },
    ]);

    await expect(unpublishWorld(ACTOR, "world_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/Money World Lesson/),
      details: { lessonIds: ["lesson_1"] },
    });
    expect(mockUnpublishWorldRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("names every referencing lesson when more than one published lesson belongs to this world", async () => {
    mockListPublishedLessonsByWorldId.mockResolvedValueOnce([
      { id: "lesson_1", title: { en: "First", hi: "x", hx: "x" }, chapter: 1, step: 1 },
      { id: "lesson_2", title: { en: "Second", hi: "x", hx: "x" }, chapter: 1, step: 2 },
    ]);

    await expect(unpublishWorld(ACTOR, "world_1", META)).rejects.toMatchObject({
      message: expect.stringMatching(/First.*Second/),
    });
  });

  it("allows unpublish once no published lesson references the world anymore", async () => {
    mockListPublishedLessonsByWorldId.mockResolvedValueOnce([]);
    mockUnpublishWorldRow.mockResolvedValueOnce(worldRow({ status: "draft" }));

    const result = await unpublishWorld(ACTOR, "world_1", META);

    expect(result.status).toBe("draft");
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
