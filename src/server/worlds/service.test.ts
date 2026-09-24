import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetWorldById = vi.fn();
const mockDeleteWorldRow = vi.fn();
const mockHotfixWorldRow = vi.fn();
const mockInsertDraftWorld = vi.fn();
const mockListAllWorlds = vi.fn();
const mockListPublishedWorlds = vi.fn();
const mockMoveWorldToPosition = vi.fn();
const mockPublishWorldRow = vi.fn();
const mockSetWorldArtKey = vi.fn();
const mockUnpublishWorldRow = vi.fn();
const mockUpdateDraftWorld = vi.fn();
// A real class (not a mock fn) so `err instanceof WorldOrderConflictError`
// in the service under test matches against the exact same reference this
// mock hands back from a rejected deleteWorldRow() call. vi.hoisted() is
// required (not a plain top-level class) since vi.mock()'s factory is
// hoisted above normal module-body code, including class declarations.
const { MockWorldOrderConflictError } = vi.hoisted(() => ({
  MockWorldOrderConflictError: class extends Error {},
}));
vi.mock("./repo", () => ({
  getWorldById: (id: unknown) => mockGetWorldById(id),
  deleteWorldRow: (id: unknown) => mockDeleteWorldRow(id),
  hotfixWorldRow: (input: unknown) => mockHotfixWorldRow(input),
  insertDraftWorld: (input: unknown) => mockInsertDraftWorld(input),
  listAllWorlds: () => mockListAllWorlds(),
  listPublishedWorlds: () => mockListPublishedWorlds(),
  moveWorldToPosition: (id: unknown, newOrder: unknown) => mockMoveWorldToPosition(id, newOrder),
  publishWorldRow: (id: unknown, staffId: unknown) => mockPublishWorldRow(id, staffId),
  setWorldArtKey: (id: unknown, artKey: unknown) => mockSetWorldArtKey(id, artKey),
  unpublishWorldRow: (id: unknown) => mockUnpublishWorldRow(id),
  updateDraftWorld: (input: unknown) => mockUpdateDraftWorld(input),
  WorldOrderConflictError: MockWorldOrderConflictError,
}));

const mockGetMentorById = vi.fn();
const mockListAllMentors = vi.fn();
vi.mock("@/server/mentors/repo", () => ({
  getMentorById: (id: unknown) => mockGetMentorById(id),
  listAllMentors: () => mockListAllMentors(),
}));

const mockListPublishedLessonsByWorldId = vi.fn();
const mockListAllLessonsForWorld = vi.fn();
const mockHasBossQuizLesson = vi.fn();
vi.mock("@/server/lessons/repo", () => ({
  listPublishedLessonsByWorldId: (worldId: unknown) => mockListPublishedLessonsByWorldId(worldId),
  listAllLessonsForWorld: (worldId: unknown) => mockListAllLessonsForWorld(worldId),
  hasBossQuizLesson: (worldId: unknown) => mockHasBossQuizLesson(worldId),
}));

const mockGetWorldIdsWithPassedBossQuiz = vi.fn();
vi.mock("@/server/quiz-attempts/repo", () => ({
  getWorldIdsWithPassedBossQuiz: (userId: unknown, passMarkPct: unknown) =>
    mockGetWorldIdsWithPassedBossQuiz(userId, passMarkPct),
}));

const mockGetLessonFlowScoringSettings = vi.fn();
vi.mock("@/server/settings/service", () => ({
  getLessonFlowScoringSettings: () => mockGetLessonFlowScoringSettings(),
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

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) =>
    mockRoleHasPermission(roleId, permission),
}));

import {
  createWorldDraft,
  deleteWorld,
  getPublicWorlds,
  getWorldEditorData,
  hotfixWorld,
  isTradingUnlocked,
  publishWorld,
  reorderWorld,
  unpublishWorld,
  updateWorldDraft,
  uploadWorldArt,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1", roleId: "role_1" };
const MENTOR_ID = "mentor_1";
const USER_ID = "user_1";

function worldRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "world_1",
    order: 1,
    code: "MW",
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
  // No lessons by default - existing tests below don't need to know about
  // deleteWorld's lesson-block check at all.
  mockListAllLessonsForWorld.mockResolvedValue([]);
  // No cleared worlds by default - existing getPublicWorlds tests below
  // don't need to know about the unlock check at all.
  mockGetWorldIdsWithPassedBossQuiz.mockResolvedValue(new Set());
  mockGetLessonFlowScoringSettings.mockResolvedValue({
    bossQuizPassMarkPct: 60,
    tradingUnlockAfterWorldPosition: 3,
  });
  // A boss_quiz lesson already exists by default - existing publishWorld
  // tests below don't need to know about the D24 publish-time gate at all.
  mockHasBossQuizLesson.mockResolvedValue(true);
  // Actor has every permission by default - existing tests below don't need
  // to know about the art-upload/reorder permission-tier checks at all.
  mockRoleHasPermission.mockResolvedValue(true);
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
      mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());

      const result = await getPublicWorlds(USER_ID);

      expect(result[0]!.locked).toBe(false);
    });

    it("locks the second world until the first world's Boss Quiz is passed", async () => {
      mockListPublishedWorlds.mockResolvedValueOnce([
        worldRow({ id: "world_1", order: 1 }),
        worldRow({ id: "world_2", order: 2 }),
      ]);
      mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
      mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set()); // nothing cleared yet

      const result = await getPublicWorlds(USER_ID);

      expect(result[0]!.locked).toBe(false);
      expect(result[1]!.locked).toBe(true);
    });

    it("unlocks the second world once the first world's Boss Quiz is passed", async () => {
      mockListPublishedWorlds.mockResolvedValueOnce([
        worldRow({ id: "world_1", order: 1 }),
        worldRow({ id: "world_2", order: 2 }),
      ]);
      mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
      mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set(["world_1"]));

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
      mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set(["world_1"]));

      const result = await getPublicWorlds(USER_ID);

      expect(result[1]!.locked).toBe(false); // world 2: previous (world 1) cleared
      expect(result[2]!.locked).toBe(true); // world 3: previous (world 2) NOT cleared
    });

    it("passes the caller's userId and the admin-editable pass mark through to the progress check", async () => {
      mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
      mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
      mockGetLessonFlowScoringSettings.mockResolvedValueOnce({ bossQuizPassMarkPct: 75 });

      await getPublicWorlds(USER_ID);

      expect(mockGetWorldIdsWithPassedBossQuiz).toHaveBeenCalledWith(USER_ID, 75);
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

  it("names the code specifically when the collision is on code, not order", async () => {
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    mockInsertDraftWorld.mockRejectedValueOnce({ code: "23505", constraint_name: "worlds_code_unique" });

    await expect(
      createWorldDraft(
        ACTOR,
        {
          order: 1,
          code: "MW",
          title: worldRow().title,
          tagline: worldRow().tagline,
          theme: "#7C3AED",
          displayXpTarget: 5,
          mentorId: MENTOR_ID,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringMatching(/code MW/i) });
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
  it("moves a draft world and logs it, once newOrder is within range", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "draft" }));
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
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "draft" }));
    mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow(), worldRow()]);

    await expect(reorderWorld(ACTOR, "world_1", 0, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockMoveWorldToPosition).not.toHaveBeenCalled();
  });

  it("rejects newOrder beyond the current world count without calling the repo", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "draft" }));
    mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow(), worldRow()]); // count: 3

    await expect(reorderWorld(ACTOR, "world_1", 4, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockMoveWorldToPosition).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown world", async () => {
    mockGetWorldById.mockResolvedValueOnce(null);

    await expect(reorderWorld(ACTOR, "nope", 1, META)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockLogActivity).not.toHaveBeenCalled();
    expect(mockListAllWorlds).not.toHaveBeenCalled();
  });

  it.each([["serialization failure", "40001"], ["deadlock", "40P01"]])(
    "maps a genuine concurrent-transaction conflict (%s) to a clean, retryable CONFLICT",
    async (_label, code) => {
      mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "draft" }));
      mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow()]);
      mockMoveWorldToPosition.mockRejectedValueOnce({ code });

      await expect(reorderWorld(ACTOR, "world_1", 2, META)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(mockLogActivity).not.toHaveBeenCalled();
    },
  );

  it("re-throws an unrelated error instead of misreporting it as a reorder conflict", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "draft" }));
    mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow()]);
    mockMoveWorldToPosition.mockRejectedValueOnce(new Error("something else entirely"));

    await expect(reorderWorld(ACTOR, "world_1", 2, META)).rejects.toThrow("something else entirely");
  });

  // D25 (docs/ARCHITECTURE.md): reordering a published world can shift which
  // world sits at the trading-unlock position, so it needs world.publish -
  // the same trust bar as publish/unpublish/delete - while a draft reorder
  // only needs world.manage.
  describe("permission tier depends on the mover's status", () => {
    it("allows a draft reorder for an actor with only world.manage", async () => {
      mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "draft" }));
      mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow()]);
      mockRoleHasPermission.mockImplementation((_roleId: string, perm: string) =>
        Promise.resolve(perm === "world.manage"),
      );
      mockMoveWorldToPosition.mockResolvedValueOnce(worldRow({ order: 2 }));

      await expect(reorderWorld(ACTOR, "world_1", 2, META)).resolves.toBeDefined();
    });

    it("blocks a published reorder for an actor with only world.manage", async () => {
      mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "published" }));
      mockRoleHasPermission.mockImplementation((_roleId: string, perm: string) =>
        Promise.resolve(perm === "world.manage"),
      );

      await expect(reorderWorld(ACTOR, "world_1", 2, META)).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: expect.stringMatching(/world\.publish/),
      });
      expect(mockMoveWorldToPosition).not.toHaveBeenCalled();
      expect(mockLogActivity).not.toHaveBeenCalled();
    });

    it("allows a published reorder for an actor with world.publish", async () => {
      mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "published" }));
      mockListAllWorlds.mockResolvedValueOnce([worldRow(), worldRow()]);
      mockRoleHasPermission.mockImplementation((_roleId: string, perm: string) =>
        Promise.resolve(perm === "world.publish"),
      );
      mockMoveWorldToPosition.mockResolvedValueOnce(worldRow({ order: 2, status: "published" }));

      await expect(reorderWorld(ACTOR, "world_1", 2, META)).resolves.toBeDefined();
    });
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

  it("blocks publish when code is missing", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ code: null }));

    await expect(publishWorld(ACTOR, "world_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { missingFields: ["code"] },
    });
    expect(mockPublishWorldRow).not.toHaveBeenCalled();
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

  // D24 (docs/ARCHITECTURE.md): a world can't publish without at least a
  // DRAFT boss_quiz lesson - the lesson can't be published until AFTER its
  // world is, so requiring a published one here would be impossible.
  it("blocks publish when the world has no boss_quiz lesson at all yet, even a draft", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockHasBossQuizLesson.mockResolvedValueOnce(false);

    await expect(publishWorld(ACTOR, "world_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/Boss Quiz/i),
    });
    expect(mockPublishWorldRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
    expect(mockGetMentorById).not.toHaveBeenCalled(); // fails before even checking the mentor
  });

  it("allows publish once a boss_quiz lesson exists as a draft (published isn't required)", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockHasBossQuizLesson.mockResolvedValueOnce(true); // exists, but not published - fine
    mockGetMentorById.mockResolvedValueOnce(mentorRow());
    mockPublishWorldRow.mockResolvedValueOnce(worldRow({ status: "published" }));

    const result = await publishWorld(ACTOR, "world_1", META);

    expect(result.status).toBe("published");
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
  it("uploads to storage under a server-generated, unique key, records old+new keys, and logs it", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ artKey: "worlds/world_1/old-key.png" }));
    mockSetWorldArtKey.mockResolvedValueOnce(worldRow({ artKey: "worlds/world_1/new-key.png" }));

    const result = await uploadWorldArt(ACTOR, "world_1", { body: PNG_BYTES }, META);

    expect(mockUploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^worlds\/world_1\/[0-9a-f-]+\.png$/),
      PNG_BYTES,
      "image/png",
    );
    expect(result.artKey).toBe("worlds/world_1/new-key.png");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "world.art_uploaded",
        metadata: expect.objectContaining({
          previousArtKey: "worlds/world_1/old-key.png",
          newArtKey: expect.stringMatching(/^worlds\/world_1\/[0-9a-f-]+\.png$/),
        }),
      }),
    );
  });

  it("never reuses the previous art's key - the old object is never overwritten or deleted", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ artKey: "worlds/world_1/old-key.png" }));
    mockSetWorldArtKey.mockResolvedValueOnce(worldRow());

    await uploadWorldArt(ACTOR, "world_1", { body: PNG_BYTES }, META);

    const [uploadedKey] = mockUploadObject.mock.calls[0]!;
    expect(uploadedKey).not.toBe("worlds/world_1/old-key.png");
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

  // D20/D25 (docs/ARCHITECTURE.md): a published world's art is live content
  // - replacing it needs world.publish, the same trust bar as the
  // title/tagline hotfix path, not just world.manage. A draft's art is
  // normal editing.
  describe("permission tier depends on the world's status", () => {
    it("allows a draft upload for an actor with only world.manage", async () => {
      mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "draft" }));
      mockRoleHasPermission.mockImplementation((_roleId: string, perm: string) =>
        Promise.resolve(perm === "world.manage"),
      );
      mockSetWorldArtKey.mockResolvedValueOnce(worldRow());

      await expect(
        uploadWorldArt(ACTOR, "world_1", { body: PNG_BYTES }, META),
      ).resolves.toBeDefined();
    });

    it("blocks a published-world upload for an actor with only world.manage", async () => {
      mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "published" }));
      mockRoleHasPermission.mockImplementation((_roleId: string, perm: string) =>
        Promise.resolve(perm === "world.manage"),
      );

      await expect(
        uploadWorldArt(ACTOR, "world_1", { body: PNG_BYTES }, META),
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/world\.publish/) });
      expect(mockUploadObject).not.toHaveBeenCalled();
      expect(mockLogActivity).not.toHaveBeenCalled();
    });

    it("allows a published-world upload for an actor with world.publish", async () => {
      mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "published" }));
      mockRoleHasPermission.mockImplementation((_roleId: string, perm: string) =>
        Promise.resolve(perm === "world.publish"),
      );
      mockSetWorldArtKey.mockResolvedValueOnce(worldRow({ status: "published" }));

      await expect(
        uploadWorldArt(ACTOR, "world_1", { body: PNG_BYTES }, META),
      ).resolves.toBeDefined();
    });
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

// D25 (docs/ARCHITECTURE.md): nothing in getPublicWorlds may assume any
// particular world count - it must work identically whether staff have
// published 2 worlds or 12, and whether one mentor covers every world or
// each has its own.
describe("world count independence", () => {
  function manyWorlds(count: number) {
    return Array.from({ length: count }, (_, i) =>
      worldRow({ id: `world_${i + 1}`, order: i + 1, title: { en: `World ${i + 1}`, hi: "x", hx: "x" } }),
    );
  }

  it("sequentially unlocks correctly across only 2 published worlds", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce(manyWorlds(2));
    mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set(["world_1"]));

    const result = await getPublicWorlds(USER_ID);

    expect(result).toHaveLength(2);
    expect(result[0]!.locked).toBe(false);
    expect(result[1]!.locked).toBe(false);
  });

  it("sequentially unlocks correctly across 12 published worlds", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce(manyWorlds(12));
    mockListAllMentors.mockResolvedValueOnce([mentorRow()]);
    // Cleared worlds 1-5 only - world 7 (index 6) should be the first locked one.
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(
      new Set(["world_1", "world_2", "world_3", "world_4", "world_5"]),
    );

    const result = await getPublicWorlds(USER_ID);

    expect(result).toHaveLength(12);
    for (let i = 0; i < 6; i++) expect(result[i]!.locked).toBe(false); // worlds 1-6 unlocked
    for (let i = 6; i < 12; i++) expect(result[i]!.locked).toBe(true); // worlds 7-12 locked
  });

  it("one mentor can cover every world - mentorKey resolves the same for all of them", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce(
      manyWorlds(5).map((w) => ({ ...w, mentorId: MENTOR_ID })),
    );
    mockListAllMentors.mockResolvedValueOnce([mentorRow({ key: "shared" })]);

    const result = await getPublicWorlds(USER_ID);

    expect(result.every((w) => w.mentorKey === "shared")).toBe(true);
  });

  it("resolves the correct mentorKey per world out of 5 distinct mentors, including one shared by several worlds", async () => {
    const fiveMentors = [
      mentorRow({ id: "m1", key: "mentor_1" }),
      mentorRow({ id: "m2", key: "mentor_2" }),
      mentorRow({ id: "m3", key: "shared_mentor" }),
      mentorRow({ id: "m4", key: "mentor_4" }),
      mentorRow({ id: "m5", key: "mentor_5" }),
    ];
    // world_1 and world_3 both use the shared mentor (m3); the rest each use
    // their own distinct mentor.
    const worldsWithMentors = [
      worldRow({ id: "world_1", order: 1, mentorId: "m3" }),
      worldRow({ id: "world_2", order: 2, mentorId: "m1" }),
      worldRow({ id: "world_3", order: 3, mentorId: "m3" }),
      worldRow({ id: "world_4", order: 4, mentorId: "m4" }),
    ];
    mockListPublishedWorlds.mockResolvedValueOnce(worldsWithMentors);
    mockListAllMentors.mockResolvedValueOnce(fiveMentors);

    const result = await getPublicWorlds(USER_ID);

    expect(result.map((w) => w.mentorKey)).toEqual([
      "shared_mentor",
      "mentor_1",
      "shared_mentor",
      "mentor_4",
    ]);
  });
});

// D25 (docs/ARCHITECTURE.md): trading unlocks by POSITION in the published,
// ordered world list, never a specific world id or name.
describe("isTradingUnlocked", () => {
  it("is locked when fewer published worlds exist than the configured position", async () => {
    mockGetLessonFlowScoringSettings.mockResolvedValueOnce({
      bossQuizPassMarkPct: 60,
      tradingUnlockAfterWorldPosition: 3,
    });
    mockListPublishedWorlds.mockResolvedValueOnce([
      worldRow({ id: "world_1", order: 1 }),
      worldRow({ id: "world_2", order: 2 }),
    ]);

    const result = await isTradingUnlocked(USER_ID);

    expect(result).toBe(false);
    expect(mockGetWorldIdsWithPassedBossQuiz).not.toHaveBeenCalled();
  });

  it("is locked when enough worlds exist but the target position's Boss Quiz hasn't been passed", async () => {
    mockGetLessonFlowScoringSettings.mockResolvedValueOnce({
      bossQuizPassMarkPct: 60,
      tradingUnlockAfterWorldPosition: 3,
    });
    mockListPublishedWorlds.mockResolvedValueOnce([
      worldRow({ id: "world_1", order: 1 }),
      worldRow({ id: "world_2", order: 2 }),
      worldRow({ id: "world_3", order: 3 }),
    ]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set(["world_1", "world_2"]));

    const result = await isTradingUnlocked(USER_ID);

    expect(result).toBe(false);
  });

  it("unlocks once the world at the configured position has a passed Boss Quiz", async () => {
    mockGetLessonFlowScoringSettings.mockResolvedValueOnce({
      bossQuizPassMarkPct: 60,
      tradingUnlockAfterWorldPosition: 3,
    });
    mockListPublishedWorlds.mockResolvedValueOnce([
      worldRow({ id: "world_1", order: 1 }),
      worldRow({ id: "world_2", order: 2 }),
      worldRow({ id: "world_3", order: 3 }),
    ]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(
      new Set(["world_1", "world_2", "world_3"]),
    );

    const result = await isTradingUnlocked(USER_ID);

    expect(result).toBe(true);
  });

  it("moves automatically when the position setting changes, with no world-id/name dependency", async () => {
    mockGetLessonFlowScoringSettings.mockResolvedValueOnce({
      bossQuizPassMarkPct: 60,
      tradingUnlockAfterWorldPosition: 1,
    });
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow({ id: "world_1", order: 1 })]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set(["world_1"]));

    const result = await isTradingUnlocked(USER_ID);

    expect(result).toBe(true);
  });
});

describe("deleteWorld", () => {
  it("deletes a world with no lessons and logs it", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockListAllLessonsForWorld.mockResolvedValueOnce([]);
    mockDeleteWorldRow.mockResolvedValueOnce(worldRow());

    const result = await deleteWorld(ACTOR, "world_1", META);

    expect(result.id).toBe("world_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "world.deleted", actorId: "staff_1" }),
    );
  });

  it("deletes an empty PUBLISHED world directly - no unpublish-first requirement", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "published" }));
    mockListAllLessonsForWorld.mockResolvedValueOnce([]);
    mockDeleteWorldRow.mockResolvedValueOnce(worldRow({ status: "published" }));

    const result = await deleteWorld(ACTOR, "world_1", META);

    expect(result.id).toBe("world_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "world.deleted" }),
    );
  });

  it("blocks deletion and names the lesson count when the world still has lessons (any status)", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockListAllLessonsForWorld.mockResolvedValueOnce([{ id: "l1" }, { id: "l2" }]);

    await expect(deleteWorld(ACTOR, "world_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/2 lesson/),
    });
    expect(mockDeleteWorldRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown world", async () => {
    mockGetWorldById.mockResolvedValueOnce(null);

    await expect(deleteWorld(ACTOR, "nope", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockListAllLessonsForWorld).not.toHaveBeenCalled();
  });

  // The lesson-count check and the delete itself aren't in the same
  // transaction, so a genuinely concurrent write can still surface at the
  // deleteWorldRow() call - both failure modes must map to a clean,
  // retryable CONFLICT rather than an unmapped 500.
  it("maps a WorldOrderConflictError from deleteWorldRow to a retryable CONFLICT", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockListAllLessonsForWorld.mockResolvedValueOnce([]);
    mockDeleteWorldRow.mockRejectedValueOnce(new MockWorldOrderConflictError());

    await expect(deleteWorld(ACTOR, "world_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/order.*try again/i),
    });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("maps a foreign-key violation (a lesson created between the check and the delete) to a retryable CONFLICT", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockListAllLessonsForWorld.mockResolvedValueOnce([]);
    mockDeleteWorldRow.mockRejectedValueOnce({ code: "23503" });

    await expect(deleteWorld(ACTOR, "world_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/lesson was just added/i),
    });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("re-throws an unrecognized error from deleteWorldRow unchanged", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockListAllLessonsForWorld.mockResolvedValueOnce([]);
    mockDeleteWorldRow.mockRejectedValueOnce(new Error("something else entirely"));

    await expect(deleteWorld(ACTOR, "world_1", META)).rejects.toThrow("something else entirely");
  });
});
