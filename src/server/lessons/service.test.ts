import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLessonById = vi.fn();
const mockGetPublishedLesson = vi.fn();
const mockGetPublishedLessonAtPosition = vi.fn();
const mockHotfixLessonRow = vi.fn();
const mockInsertDraftLesson = vi.fn();
const mockListAllLessonsForWorld = vi.fn();
const mockListAllPublishedLessons = vi.fn();
const mockListPublishedLessonsForWorld = vi.fn();
const mockPublishLessonRow = vi.fn();
const mockUnpublishLessonRow = vi.fn();
const mockUpdateDraftLesson = vi.fn();
vi.mock("./repo", () => ({
  getLessonById: (id: unknown) => mockGetLessonById(id),
  getPublishedLesson: (id: unknown) => mockGetPublishedLesson(id),
  getPublishedLessonAtPosition: (worldId: unknown, chapter: unknown, step: unknown) =>
    mockGetPublishedLessonAtPosition(worldId, chapter, step),
  hotfixLessonRow: (input: unknown) => mockHotfixLessonRow(input),
  insertDraftLesson: (input: unknown) => mockInsertDraftLesson(input),
  listAllLessonsForWorld: (worldId: unknown) => mockListAllLessonsForWorld(worldId),
  listAllPublishedLessons: () => mockListAllPublishedLessons(),
  listPublishedLessonsForWorld: (worldId: unknown) => mockListPublishedLessonsForWorld(worldId),
  publishLessonRow: (id: unknown, staffId: unknown) => mockPublishLessonRow(id, staffId),
  unpublishLessonRow: (id: unknown) => mockUnpublishLessonRow(id),
  updateDraftLesson: (input: unknown) => mockUpdateDraftLesson(input),
}));

const mockGetWorldById = vi.fn();
const mockListPublishedWorlds = vi.fn();
vi.mock("@/server/worlds/repo", () => ({
  getWorldById: (id: unknown) => mockGetWorldById(id),
  listPublishedWorlds: () => mockListPublishedWorlds(),
}));

const mockGetQuestionsByIds = vi.fn();
vi.mock("@/server/questions/repo", () => ({
  getQuestionsByIds: (ids: unknown) => mockGetQuestionsByIds(ids),
}));

const mockCountInProgressLearnersByLessonIds = vi.fn();
const mockGetLessonProgressStatusesForUser = vi.fn();
vi.mock("@/server/lesson-progress/repo", () => ({
  countInProgressLearnersByLessonIds: (lessonIds: unknown) =>
    mockCountInProgressLearnersByLessonIds(lessonIds),
  getLessonProgressStatusesForUser: (userId: unknown, lessonIds: unknown) =>
    mockGetLessonProgressStatusesForUser(userId, lessonIds),
}));

const mockGetWorldIdsWithPassedBossQuiz = vi.fn();
vi.mock("@/server/quiz-attempts/repo", () => ({
  getWorldIdsWithPassedBossQuiz: (userId: unknown, passMark: unknown) =>
    mockGetWorldIdsWithPassedBossQuiz(userId, passMark),
}));

const mockListRewardRules = vi.fn();
const mockGetCreditedLessonIdsForUser = vi.fn();
vi.mock("@/server/economy/repo", () => ({
  listRewardRules: () => mockListRewardRules(),
  getCreditedLessonIdsForUser: (userId: unknown, lessonIds: unknown) =>
    mockGetCreditedLessonIdsForUser(userId, lessonIds),
}));

// previewLessonReward's own math (per-kind defaults, overrides, the
// multiplier) is already pinned independently in economy/service.test.ts -
// this file only needs to prove lessons/service.ts WIRES it correctly
// (calls it, places the result in the right field, skips it once
// rewardEarned), so it's mocked as a plain black box like everything else
// here, not run for real.
const mockGetVmIssuanceMultiplier = vi.fn();
const mockPreviewLessonReward = vi.fn();
vi.mock("@/server/economy/service", () => ({
  getVmIssuanceMultiplier: () => mockGetVmIssuanceMultiplier(),
  previewLessonReward: (lesson: unknown, ruleByActivityKind: unknown, multiplier: unknown) =>
    mockPreviewLessonReward(lesson, ruleByActivityKind, multiplier),
}));

const mockGetLessonFlowScoringSettings = vi.fn();
const mockGetLessonDefaultDurationSettings = vi.fn();
vi.mock("@/server/settings/service", () => ({
  getLessonFlowScoringSettings: () => mockGetLessonFlowScoringSettings(),
  getLessonDefaultDurationSettings: () => mockGetLessonDefaultDurationSettings(),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import {
  createLessonDraft,
  getCurrentLesson,
  getLessonEditorData,
  getLessonPreview,
  getPublicLesson,
  getPublicLessonsForWorld,
  hotfixLesson,
  listPublishedLessonsReferencingQuestion,
  publishLesson,
  unpublishLesson,
  updateLessonDraft,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1" };
const WORLD_ID = "world_1";
const LEARNER_ID = "learner_1";

function lessonRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lesson_1",
    worldId: WORLD_ID,
    chapter: 1,
    step: 1,
    kind: "quiz" as const,
    title: { en: "Test Lesson", hi: "टेस्ट लेसन", hx: "Test Lesson" },
    blurb: { en: "en blurb", hi: "hi blurb", hx: "hx blurb" },
    content: { questionIds: ["11111111-1111-4111-8111-111111111111"] },
    status: "draft" as const,
    publishedAt: null,
    publishedBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function worldRow(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: WORLD_ID, title: { en: "Test World" }, status: "published" as const, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The default lessonRow() (kind: "quiz") references question id
  // "11111111-...", already published - existing publish-success tests
  // below don't need to know about the D18 question-reference gate at all.
  mockGetQuestionsByIds.mockResolvedValue([
    { id: "11111111-1111-4111-8111-111111111111", status: "published", format: "single_select" },
  ]);
  mockCountInProgressLearnersByLessonIds.mockResolvedValue(new Map());
  mockGetLessonFlowScoringSettings.mockResolvedValue({ bossQuizPassMarkPct: 70 });
  // WH-12 per-node state defaults: this world is the only (unlocked)
  // published world, with no progress yet - existing
  // getPublicLessonsForWorld tests below that don't care about lock/
  // progress state can rely on these "nothing special" defaults.
  mockListPublishedWorlds.mockResolvedValue([worldRow()]);
  mockGetWorldIdsWithPassedBossQuiz.mockResolvedValue(new Set());
  mockGetLessonProgressStatusesForUser.mockResolvedValue(new Map());
  // Lesson-meta defaults (feat/lesson-meta-and-pass-flag): docs/ECONOMY.md's
  // seeded 3x reward_rules values, a 1.0 VM multiplier, nothing credited yet,
  // and the seeded lesson_default_duration_seconds - same numbers every
  // per-node-state test above already runs against without asserting on
  // them, so only the tests that actually check the full summary/detail
  // shape below need to spell these out.
  mockListRewardRules.mockResolvedValue([]);
  mockGetVmIssuanceMultiplier.mockResolvedValue(1);
  mockGetCreditedLessonIdsForUser.mockResolvedValue(new Set());
  // Matches the "quiz" kind docs/ECONOMY.md default (defaultXp 50, defaultVm
  // 90 * 100 paise) - the kind every lessonRow() fixture defaults to, so the
  // tests that assert the full summary/detail shape don't need their own
  // per-test override.
  mockPreviewLessonReward.mockReturnValue({ xpReward: 50, vmRewardPaise: 9000 });
  mockGetLessonDefaultDurationSettings.mockResolvedValue({
    quiz: 180,
    boss_quiz: 600,
    role_play: 420,
    doubt_zone: 300,
  });
});

describe("getPublicLessonsForWorld / getPublicLesson", () => {
  it("maps published lessons to the summary shape (no content field), with per-node state", async () => {
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([lessonRow()]);

    const result = await getPublicLessonsForWorld(WORLD_ID, LEARNER_ID);

    expect(result).toEqual([
      {
        id: "lesson_1",
        chapter: 1,
        step: 1,
        kind: "quiz",
        title: lessonRow().title,
        blurb: lessonRow().blurb,
        state: "current",
        chapterNumber: 1,
        durationSeconds: 180, // settings_kv default for "quiz"
        xpReward: 50, // reward_rules "quiz" defaultXp
        vmRewardPaise: 9000, // defaultVm 90 * 100 paise * multiplier 1.0
        rewardEarned: false,
      },
    ]);
    expect(result[0]).not.toHaveProperty("content");
  });

  it("returns an empty array for a world with no published lessons, without computing lock/progress state", async () => {
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([]);

    const result = await getPublicLessonsForWorld(WORLD_ID, LEARNER_ID);

    expect(result).toEqual([]);
    expect(mockListPublishedWorlds).not.toHaveBeenCalled();
    expect(mockGetLessonProgressStatusesForUser).not.toHaveBeenCalled();
  });

  // WH-12 (World Home journey map) - per-node state
  describe("per-node state", () => {
    it("marks the first incomplete lesson current and every later incomplete one available", async () => {
      const l1 = lessonRow({ id: "l1", chapter: 1, step: 1 });
      const l2 = lessonRow({ id: "l2", chapter: 1, step: 2 });
      const l3 = lessonRow({ id: "l3", chapter: 1, step: 3 });
      mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1, l2, l3]);
      mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map());

      const result = await getPublicLessonsForWorld(WORLD_ID, LEARNER_ID);

      expect(result.map((r) => r.state)).toEqual(["current", "available", "available"]);
    });

    it("marks a completed lesson done and resumes current at the first incomplete one", async () => {
      const l1 = lessonRow({ id: "l1", chapter: 1, step: 1 });
      const l2 = lessonRow({ id: "l2", chapter: 1, step: 2 });
      const l3 = lessonRow({ id: "l3", chapter: 1, step: 3 });
      mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1, l2, l3]);
      mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map([["l1", "completed"]]));

      const result = await getPublicLessonsForWorld(WORLD_ID, LEARNER_ID);

      expect(result.map((r) => r.state)).toEqual(["done", "current", "available"]);
    });

    it("an in_progress (not completed) lesson is not 'done' - it's still the current one", async () => {
      const l1 = lessonRow({ id: "l1", chapter: 1, step: 1 });
      mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1]);
      mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map([["l1", "in_progress"]]));

      const result = await getPublicLessonsForWorld(WORLD_ID, LEARNER_ID);

      expect(result[0]!.state).toBe("current");
    });

    it("marks every node done once the whole world is completed (no 'current' left)", async () => {
      const l1 = lessonRow({ id: "l1", chapter: 1, step: 1 });
      const l2 = lessonRow({ id: "l2", chapter: 1, step: 2 });
      mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1, l2]);
      mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(
        new Map([
          ["l1", "completed"],
          ["l2", "completed"],
        ]),
      );

      const result = await getPublicLessonsForWorld(WORLD_ID, LEARNER_ID);

      expect(result.map((r) => r.state)).toEqual(["done", "done"]);
    });

    // D76 (docs/ARCHITECTURE.md): "locked" reflects the same sequential
    // world-unlock rule as GET /api/v1/worlds's own `locked` field - every
    // node in a not-yet-unlocked world is "locked", regardless of any
    // lesson_progress row (which, structurally, can't exist yet for a world
    // this learner has never been able to reach).
    it("marks every node locked when the world itself isn't unlocked yet", async () => {
      const world2 = worldRow({ id: "world_2", order: 2 });
      const l1 = lessonRow({ id: "l1", worldId: "world_2", chapter: 1, step: 1 });
      mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1]);
      mockListPublishedWorlds.mockResolvedValueOnce([worldRow({ order: 1 }), world2]);
      mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set()); // world 1 not cleared

      const result = await getPublicLessonsForWorld("world_2", LEARNER_ID);

      expect(result.map((r) => r.state)).toEqual(["locked"]);
      // Locked is purely informational (D76) - no progress lookup needed
      // once the world itself is known to be out of reach.
      expect(mockGetLessonProgressStatusesForUser).not.toHaveBeenCalled();
    });

    it("the first published world is never locked, regardless of Boss Quiz progress anywhere", async () => {
      const l1 = lessonRow({ id: "l1", chapter: 1, step: 1 });
      mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1]);
      mockListPublishedWorlds.mockResolvedValueOnce([worldRow({ order: 1 })]);
      mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());

      const result = await getPublicLessonsForWorld(WORLD_ID, LEARNER_ID);

      expect(result[0]!.state).not.toBe("locked");
    });

    it("unlocks once the previous world's Boss Quiz is passed", async () => {
      const world2 = worldRow({ id: "world_2", order: 2 });
      const l1 = lessonRow({ id: "l1", worldId: "world_2", chapter: 1, step: 1 });
      mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1]);
      mockListPublishedWorlds.mockResolvedValueOnce([worldRow({ order: 1 }), world2]);
      mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set([WORLD_ID]));
      mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map());

      const result = await getPublicLessonsForWorld("world_2", LEARNER_ID);

      expect(result[0]!.state).toBe("current");
    });
  });

  it("maps a single published lesson to the full detail shape", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(lessonRow());

    const result = await getPublicLesson("lesson_1", LEARNER_ID);

    expect(result).toEqual({
      id: "lesson_1",
      worldId: WORLD_ID,
      chapter: 1,
      step: 1,
      kind: "quiz",
      title: lessonRow().title,
      blurb: lessonRow().blurb,
      content: lessonRow().content,
      chapterNumber: 1,
      durationSeconds: 180,
      xpReward: 50,
      vmRewardPaise: 9000,
      rewardEarned: false,
    });
  });

  it("returns null xpReward/vmRewardPaise and rewardEarned: true once this learner is already credited", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(lessonRow());
    mockGetCreditedLessonIdsForUser.mockResolvedValueOnce(new Set(["lesson_1"]));

    const result = await getPublicLesson("lesson_1", LEARNER_ID);

    expect(result.xpReward).toBeNull();
    expect(result.vmRewardPaise).toBeNull();
    expect(result.rewardEarned).toBe(true);
    // Already credited - never even asks previewLessonReward what a retry
    // would pay, since the answer is "nothing, it already paid once".
    expect(mockPreviewLessonReward).not.toHaveBeenCalled();
  });

  // App asks batch, item A12.
  it("backfills content.video.url (all null) for a video lesson saved before that field existed", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(
      lessonRow({ kind: "video", content: { lengthSeconds: 48, scenes: [], cues: [] } }),
    );

    const result = await getPublicLesson("lesson_1", LEARNER_ID);

    expect(result.content).toEqual({
      lengthSeconds: 48,
      scenes: [],
      cues: [],
      video: { url: { en: null, hi: null, hx: null } },
    });
    // durationSeconds comes from the video's own content.lengthSeconds, not
    // the settings_kv per-kind default (that's only for quiz/boss_quiz/
    // role_play/doubt_zone).
    expect(result.durationSeconds).toBe(48);
  });

  it("never overwrites an already-set content.video.url", async () => {
    const withUrl = { lengthSeconds: 48, scenes: [], cues: [], video: { url: { en: "https://x/a.mp4", hi: null, hx: null } } };
    mockGetPublishedLesson.mockResolvedValueOnce(lessonRow({ kind: "video", content: withUrl }));

    const result = await getPublicLesson("lesson_1", LEARNER_ID);

    expect(result.content).toEqual(withUrl);
  });

  it("never adds content.video.url for a non-video kind", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(lessonRow()); // kind: "quiz"

    const result = await getPublicLesson("lesson_1", LEARNER_ID);

    expect(result.content).toEqual(lessonRow().content);
  });

  it("throws NOT_FOUND for an unknown/unpublished lesson id", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(null);

    await expect(getPublicLesson("nope", LEARNER_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // The single concrete guarantee this checkpoint's kickoff asked to prove:
  // no answer-bearing field ever appears in a learner-facing response. There
  // is currently no `answer` field anywhere in a lesson's content by design
  // (questions are only ever referenced by id, per D18/single-source-of-truth),
  // so this asserts that invariant directly against the real service output
  // rather than trusting the design intent alone.
  it("never includes an 'answer' key anywhere in the summary or detail response, for any kind", async () => {
    const kinds = ["video", "story", "quiz", "boss_quiz", "role_play"] as const;
    for (const kind of kinds) {
      const row = lessonRow({ kind, id: `lesson_${kind}` });
      mockListPublishedLessonsForWorld.mockResolvedValueOnce([row]);
      mockGetPublishedLesson.mockResolvedValueOnce(row);

      const summaryList = await getPublicLessonsForWorld(WORLD_ID, LEARNER_ID);
      const detail = await getPublicLesson(row.id, LEARNER_ID);

      expect(JSON.stringify(summaryList)).not.toMatch(/"answer"/i);
      expect(JSON.stringify(detail)).not.toMatch(/"answer"/i);
    }
  });
});

describe("getCurrentLesson", () => {
  const USER_ID = "user_1";
  const WORLD_2_ID = "world_2";

  it("returns the first lesson with no progress yet, in chapter/step order", async () => {
    const l1 = lessonRow({ id: "l1", chapter: 1, step: 1 });
    const l2 = lessonRow({ id: "l2", chapter: 1, step: 2 });
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1, l2]);
    mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map());

    const result = await getCurrentLesson(USER_ID);

    expect(result.id).toBe("l1");
    expect(mockGetLessonProgressStatusesForUser).toHaveBeenCalledWith(USER_ID, ["l1", "l2"]);
  });

  it("skips a completed lesson and resumes at the first incomplete one", async () => {
    const l1 = lessonRow({ id: "l1", chapter: 1, step: 1 });
    const l2 = lessonRow({ id: "l2", chapter: 1, step: 2 });
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1, l2]);
    mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map([["l1", "completed"]]));

    const result = await getCurrentLesson(USER_ID);

    expect(result.id).toBe("l2");
  });

  it("an in_progress (not completed) lesson still counts as the current one", async () => {
    const l1 = lessonRow({ id: "l1", chapter: 1, step: 1 });
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1]);
    mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map([["l1", "in_progress"]]));

    const result = await getCurrentLesson(USER_ID);

    expect(result.id).toBe("l1");
  });

  it("moves into the next world once the previous world's Boss Quiz is passed and its lessons are all done", async () => {
    const w1 = worldRow({ id: WORLD_ID });
    const w2 = worldRow({ id: WORLD_2_ID });
    const w1Lesson = lessonRow({ id: "w1-lesson", worldId: WORLD_ID });
    const w2Lesson = lessonRow({ id: "w2-lesson", worldId: WORLD_2_ID });
    mockListPublishedWorlds.mockResolvedValueOnce([w1, w2]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set([WORLD_ID]));
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([w1Lesson]); // world 1
    mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map([["w1-lesson", "completed"]]));
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([w2Lesson]); // world 2
    mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map());

    const result = await getCurrentLesson(USER_ID);

    expect(result.id).toBe("w2-lesson");
  });

  it("resumes at the last lesson of world 1 (the failed Boss Quiz) when world 2 is still locked, even though lesson_progress shows world 1 fully 'completed'", async () => {
    const w1 = worldRow({ id: WORLD_ID });
    const w2 = worldRow({ id: WORLD_2_ID });
    const bossQuiz = lessonRow({ id: "boss-quiz", worldId: WORLD_ID, kind: "boss_quiz" });
    mockListPublishedWorlds.mockResolvedValueOnce([w1, w2]);
    // Attempted and finished (so lesson_progress says "completed"), but
    // didn't pass the accuracy bar - never added to clearedWorldIds.
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([bossQuiz]);
    mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map([["boss-quiz", "completed"]]));

    const result = await getCurrentLesson(USER_ID);

    expect(result.id).toBe("boss-quiz");
    // World 2 was locked, so it was never even queried.
    expect(mockListPublishedLessonsForWorld).toHaveBeenCalledTimes(1);
  });

  it("resumes at the last lesson of the last world once everything reachable is completed", async () => {
    const w1 = worldRow({ id: WORLD_ID });
    const w1LessonA = lessonRow({ id: "w1-a", worldId: WORLD_ID });
    const w1LessonB = lessonRow({ id: "w1-b", worldId: WORLD_ID });
    mockListPublishedWorlds.mockResolvedValueOnce([w1]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set([WORLD_ID]));
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([w1LessonA, w1LessonB]);
    mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(
      new Map([
        ["w1-a", "completed"],
        ["w1-b", "completed"],
      ]),
    );

    const result = await getCurrentLesson(USER_ID);

    expect(result.id).toBe("w1-b");
  });

  it("throws NOT_FOUND when there are no published worlds", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce([]);

    await expect(getCurrentLesson(USER_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockGetWorldIdsWithPassedBossQuiz).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when every published world has zero lessons", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([]);

    await expect(getCurrentLesson(USER_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // This route's own OpenAPI description promises an identical response
  // shape to GET /api/v1/lessons/{id} - so it must carry the same
  // lesson-meta fields, for the same signed-in caller.
  it("includes the same lesson-meta fields as GET /api/v1/lessons/{id}", async () => {
    const l1 = lessonRow({ id: "l1", chapter: 1, step: 1 });
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
    mockGetWorldIdsWithPassedBossQuiz.mockResolvedValueOnce(new Set());
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([l1]);
    mockGetLessonProgressStatusesForUser.mockResolvedValueOnce(new Map());

    const result = await getCurrentLesson(USER_ID);

    expect(result).toMatchObject({
      chapterNumber: 1,
      durationSeconds: 180,
      xpReward: 50,
      vmRewardPaise: 9000,
      rewardEarned: false,
    });
    expect(mockGetCreditedLessonIdsForUser).toHaveBeenCalledWith(USER_ID, ["l1"]);
  });
});

describe("createLessonDraft", () => {
  it("creates the draft and logs it, after confirming the world exists", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockInsertDraftLesson.mockResolvedValueOnce(lessonRow());

    const input = {
      worldId: WORLD_ID,
      chapter: 1,
      step: 1,
      kind: "quiz" as const,
      title: lessonRow().title,
      blurb: lessonRow().blurb,
      content: lessonRow().content,
    };
    const result = await createLessonDraft(ACTOR, input, META);

    expect(result.id).toBe("lesson_1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: "staff", actorId: "staff_1", action: "lesson.created" }),
    );
  });

  it("throws NOT_FOUND when the world doesn't exist, without creating the lesson", async () => {
    mockGetWorldById.mockResolvedValueOnce(null);

    await expect(
      createLessonDraft(
        ACTOR,
        {
          worldId: "nope",
          chapter: 1,
          step: 1,
          kind: "quiz" as const,
          title: lessonRow().title,
          blurb: lessonRow().blurb,
          content: lessonRow().content,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockInsertDraftLesson).not.toHaveBeenCalled();
  });

  it("turns a unique-constraint violation (duplicate chapter/step) into a clear CONFLICT", async () => {
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockInsertDraftLesson.mockRejectedValueOnce({ code: "23505" });

    await expect(
      createLessonDraft(
        ACTOR,
        {
          worldId: WORLD_ID,
          chapter: 1,
          step: 1,
          kind: "quiz" as const,
          title: lessonRow().title,
          blurb: lessonRow().blurb,
          content: lessonRow().content,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("updateLessonDraft", () => {
  it("re-validates content against the existing lesson's kind, rejecting a mismatched shape", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ kind: "video" }));

    await expect(
      updateLessonDraft(
        ACTOR,
        {
          id: "lesson_1",
          worldId: WORLD_ID,
          chapter: 1,
          step: 1,
          title: lessonRow().title,
          blurb: lessonRow().blurb,
          content: { questionIds: [] }, // valid for quiz, not for video (needs lengthSeconds)
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockUpdateDraftLesson).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown lesson", async () => {
    mockGetLessonById.mockResolvedValueOnce(null);

    await expect(
      updateLessonDraft(
        ACTOR,
        {
          id: "nope",
          worldId: WORLD_ID,
          chapter: 1,
          step: 1,
          title: lessonRow().title,
          blurb: lessonRow().blurb,
          content: lessonRow().content,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the lesson is published or missing at the DB layer", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow());
    mockUpdateDraftLesson.mockResolvedValueOnce(null);

    await expect(
      updateLessonDraft(
        ACTOR,
        {
          id: "lesson_1",
          worldId: WORLD_ID,
          chapter: 1,
          step: 1,
          title: lessonRow().title,
          blurb: lessonRow().blurb,
          content: lessonRow().content,
        },
        META,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("publishLesson - translation-completeness and cue-timing gate", () => {
  // Task 4b follow-up: content that doesn't match VideoContentSchema's
  // shape AT ALL (not just one bad field a targeted check already names)
  // must still be rejected, not silently waved through because none of
  // the targeted checks (cue timing, url protocol) happen to look at
  // whatever's actually broken. validateVideoCueTiming/
  // validateVideoUrlProtocol read fields with manual typeof guards (so a
  // missing lengthSeconds or a non-array cues never throws), so this
  // exercises the validateVideoContentShape fallback specifically.
  it("blocks publish when video content doesn't match the schema at all (no targeted check catches it)", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "video",
        content: {}, // missing lengthSeconds entirely - not just a bad field
      }),
    );

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: {
        structuralErrors: [expect.stringMatching(/content\.lengthSeconds/)],
      },
    });
    expect(mockPublishLessonRow).not.toHaveBeenCalled();
  });

  it("blocks publish when a video cue is missing a required field no targeted check names", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "video",
        content: {
          lengthSeconds: 48,
          scenes: [],
          // Valid `at`/`timerSeconds` (so validateVideoCueTiming finds
          // nothing wrong) but missing questionId entirely.
          cues: [{ at: 10, timerSeconds: 8 }],
        },
      }),
    );

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: {
        structuralErrors: [expect.stringMatching(/questionId/)],
      },
    });
  });

  it("blocks publish and names every missing field, including deeply nested content leaves", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "video",
        title: { en: "Video", hi: "", hx: "Video" },
        content: {
          lengthSeconds: 48,
          scenes: [{ at: 5, kind: "trade", title: { en: "", hi: "b", hx: "c" }, caption: { en: "a", hi: "b", hx: "c" }, mascotLine: { en: "a", hi: "b", hx: "c" } }],
          cues: [],
        },
      }),
    );

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { missingFields: ["title.hi", "content.scenes[0].title.en"] },
    });
    expect(mockPublishLessonRow).not.toHaveBeenCalled();
  });

  it("rejects a video cue that fires after the video ends", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "video",
        content: {
          lengthSeconds: 48,
          scenes: [],
          cues: [{ at: 60, questionId: "11111111-1111-4111-8111-111111111111", timerSeconds: 8 }],
        },
      }),
    );

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: {
        structuralErrors: [expect.stringMatching(/after the video ends/)],
      },
    });
  });

  it("rejects out-of-order video cues", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "video",
        content: {
          lengthSeconds: 48,
          scenes: [],
          cues: [
            { at: 20, questionId: "11111111-1111-4111-8111-111111111111", timerSeconds: 8 },
            { at: 10, questionId: "22222222-2222-4222-8222-222222222222", timerSeconds: 8 },
          ],
        },
      }),
    );

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: {
        structuralErrors: [expect.stringMatching(/out of order/)],
      },
    });
  });

  // Task 4b, Rule B's timerSeconds half: already guaranteed by
  // VideoCueSchema's `.positive()` for anything saved through
  // createLessonDraft/updateLessonDraft/hotfixLesson - this exercises the
  // only way it's actually reachable, content that got into the row some
  // other way (direct DB write, a seed/migration script), which is exactly
  // why validateVideoCueTiming reads fields manually instead of gating on
  // a full VideoContentSchema.safeParse (that gate would swallow this
  // error, and every other structural error for the lesson, silently).
  it("rejects a cue with a non-positive timerSeconds", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "video",
        content: {
          lengthSeconds: 48,
          scenes: [],
          cues: [{ at: 10, questionId: "11111111-1111-4111-8111-111111111111", timerSeconds: 0 }],
        },
      }),
    );

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: {
        structuralErrors: [expect.stringMatching(/must be greater than 0/)],
      },
    });
  });

  // Task 4b, Rule A: a non-https video source a webview/native player may
  // simply refuse to load. The all-null default (hosting undecided) must
  // never itself be flagged - only an actually-set, non-https value.
  it("rejects a non-https video url", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "video",
        content: {
          lengthSeconds: 48,
          scenes: [],
          cues: [],
          video: { url: { en: "http://example.com/video.mp4", hi: null, hx: null } },
        },
      }),
    );

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: {
        structuralErrors: [expect.stringMatching(/must start with https/)],
      },
    });
  });

  it("accepts an https video url", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "video",
        content: {
          lengthSeconds: 48,
          scenes: [],
          cues: [],
          video: { url: { en: "https://cdn.example.com/video.mp4", hi: null, hx: null } },
        },
      }),
    );
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockPublishLessonRow.mockResolvedValueOnce(lessonRow({ status: "published" }));

    const result = await publishLesson(ACTOR, "lesson_1", META);

    expect(result.status).toBe("published");
  });

  it("accepts cues within bounds and in order", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "video",
        content: {
          lengthSeconds: 48,
          scenes: [],
          cues: [
            { at: 10, questionId: "11111111-1111-4111-8111-111111111111", timerSeconds: 8 },
            { at: 20, questionId: "22222222-2222-4222-8222-222222222222", timerSeconds: 8 },
          ],
        },
      }),
    );
    // Overrides the file's default (only "11111111...") - this test's own
    // second cue references "22222222...", which must also resolve as
    // published or the new D18 gate rejects before ever reaching
    // getWorldById/publishLessonRow below, leaving those two queued mocks
    // unconsumed and leaking into later tests (exactly what happened before
    // this override was added - see git history for the diagnosis).
    mockGetQuestionsByIds.mockResolvedValueOnce([
      { id: "11111111-1111-4111-8111-111111111111", status: "published", format: "single_select" },
      { id: "22222222-2222-4222-8222-222222222222", status: "published", format: "single_select" },
    ]);
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockPublishLessonRow.mockResolvedValueOnce(lessonRow({ status: "published" }));

    const result = await publishLesson(ACTOR, "lesson_1", META);

    expect(result.status).toBe("published");
  });

  it("throws NOT_FOUND for an unknown lesson", async () => {
    mockGetLessonById.mockResolvedValueOnce(null);

    await expect(publishLesson(ACTOR, "nope", META)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when the lesson is already published", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ status: "published" }));

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockPublishLessonRow).not.toHaveBeenCalled();
  });

  // The rule this checkpoint added: a lesson can't be published unless its
  // world already is.
  it("blocks publish when the lesson's world is not published yet", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow());
    mockGetWorldById.mockResolvedValueOnce(worldRow({ status: "draft" }));

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/world.*not published/i),
    });
    expect(mockPublishLessonRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("publishes and logs it once every gate passes", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow());
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockPublishLessonRow.mockResolvedValueOnce(lessonRow({ status: "published" }));

    const result = await publishLesson(ACTOR, "lesson_1", META);

    expect(result.status).toBe("published");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lesson.published", actorId: "staff_1" }),
    );
  });

  // Checkpoint 4b: Doubt Zone's chips/educationalOnlyNote are ordinary
  // nested LocalizedText leaves, so findMissingLocalizedText's generic walk
  // already covers them - these tests prove that concretely for this kind
  // rather than trusting the generic coverage carries over.
  it("blocks publish when a doubt_zone chip's reply is missing a translation", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "doubt_zone",
        content: {
          mentorKey: "baby",
          educationalOnlyNote: { en: "Educational only.", hi: "x", hx: "x" },
          chips: [
            {
              chipLabel: { en: "What is a stock?", hi: "x", hx: "x" },
              reply: { en: "A share of a company.", hi: "", hx: "x" },
            },
          ],
        },
      }),
    );

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { missingFields: ["content.chips[0].reply.hi"] },
    });
    expect(mockPublishLessonRow).not.toHaveBeenCalled();
  });

  it("blocks publish when the educational-only disclaimer itself is missing a translation", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "doubt_zone",
        content: {
          mentorKey: "baby",
          educationalOnlyNote: { en: "Educational only.", hi: "", hx: "" },
          chips: [
            {
              chipLabel: { en: "What is a stock?", hi: "x", hx: "x" },
              reply: { en: "A share.", hi: "x", hx: "x" },
            },
          ],
        },
      }),
    );

    await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      details: {
        missingFields: ["content.educationalOnlyNote.hi", "content.educationalOnlyNote.hx"],
      },
    });
  });

  it("publishes a complete doubt_zone lesson", async () => {
    mockGetLessonById.mockResolvedValueOnce(
      lessonRow({
        kind: "doubt_zone",
        content: {
          mentorKey: "baby",
          educationalOnlyNote: { en: "Educational only, never investment advice.", hi: "x", hx: "x" },
          chips: [
            {
              chipLabel: { en: "What is a stock?", hi: "x", hx: "x" },
              reply: { en: "A share of a company.", hi: "x", hx: "x" },
            },
          ],
        },
      }),
    );
    mockGetWorldById.mockResolvedValueOnce(worldRow());
    mockPublishLessonRow.mockResolvedValueOnce(lessonRow({ kind: "doubt_zone", status: "published" }));

    const result = await publishLesson(ACTOR, "lesson_1", META);

    expect(result.status).toBe("published");
  });

  // D18 (docs/ARCHITECTURE.md): a lesson can't publish while it references
  // a question that doesn't exist or isn't published - the gap Checkpoint 4
  // deliberately left open until the questions table existed (Checkpoint 5a).
  describe("D18 - question-reference gate", () => {
    it("blocks publish when a quiz-like lesson references a nonexistent question", async () => {
      mockGetLessonById.mockResolvedValueOnce(
        lessonRow({ kind: "quiz", content: { questionIds: ["11111111-1111-4111-8111-111111111111"] } }),
      );
      mockGetQuestionsByIds.mockResolvedValueOnce([]); // nothing found

      await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        details: {
          questionProblems: [
            "question 11111111-1111-4111-8111-111111111111 does not exist",
          ],
        },
      });
      expect(mockPublishLessonRow).not.toHaveBeenCalled();
      expect(mockGetWorldById).not.toHaveBeenCalled(); // fails before even checking the world
    });

    it("blocks publish when a quiz-like lesson references an unpublished question", async () => {
      mockGetLessonById.mockResolvedValueOnce(
        lessonRow({ kind: "boss_quiz", content: { questionIds: ["11111111-1111-4111-8111-111111111111"] } }),
      );
      mockGetQuestionsByIds.mockResolvedValueOnce([
        { id: "11111111-1111-4111-8111-111111111111", status: "draft" },
      ]);

      await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        details: {
          questionProblems: [
            "question 11111111-1111-4111-8111-111111111111 is not published",
          ],
        },
      });
      expect(mockPublishLessonRow).not.toHaveBeenCalled();
    });

    it("names every dangling/unpublished reference, not just the first", async () => {
      mockGetLessonById.mockResolvedValueOnce(
        lessonRow({
          kind: "role_play",
          content: {
            questionIds: [
              "11111111-1111-4111-8111-111111111111",
              "22222222-2222-4222-8222-222222222222",
            ],
            framing: { en: "x", hi: "x", hx: "x" },
          },
        }),
      );
      mockGetQuestionsByIds.mockResolvedValueOnce([
        { id: "22222222-2222-4222-8222-222222222222", status: "draft" },
        // 11111111... is missing entirely
      ]);

      await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
        details: {
          questionProblems: [
            "question 11111111-1111-4111-8111-111111111111 does not exist",
            "question 22222222-2222-4222-8222-222222222222 is not published",
          ],
        },
      });
    });

    it("blocks publish when a video lesson's in-video cue references an unpublished question", async () => {
      mockGetLessonById.mockResolvedValueOnce(
        lessonRow({
          kind: "video",
          content: {
            lengthSeconds: 48,
            scenes: [],
            cues: [
              {
                at: 10,
                questionId: "11111111-1111-4111-8111-111111111111",
                timerSeconds: 8,
              },
            ],
          },
        }),
      );
      mockGetQuestionsByIds.mockResolvedValueOnce([
        { id: "11111111-1111-4111-8111-111111111111", status: "draft" },
      ]);

      await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        details: {
          questionProblems: [
            "question 11111111-1111-4111-8111-111111111111 is not published",
          ],
        },
      });
    });

    it("never calls getQuestionsByIds for a story lesson (no question references possible)", async () => {
      mockGetLessonById.mockResolvedValueOnce(
        lessonRow({
          kind: "story",
          content: { lengthSeconds: 60, pages: [{ text: { en: "x", hi: "x", hx: "x" } }] },
        }),
      );
      mockGetWorldById.mockResolvedValueOnce(worldRow());
      mockPublishLessonRow.mockResolvedValueOnce(lessonRow({ kind: "story", status: "published" }));

      await publishLesson(ACTOR, "lesson_1", META);

      expect(mockGetQuestionsByIds).not.toHaveBeenCalled();
    });

    it("publishes once every referenced question exists and is published", async () => {
      mockGetLessonById.mockResolvedValueOnce(
        lessonRow({ kind: "quiz", content: { questionIds: ["11111111-1111-4111-8111-111111111111"] } }),
      );
      mockGetQuestionsByIds.mockResolvedValueOnce([
        { id: "11111111-1111-4111-8111-111111111111", status: "published", format: "single_select" },
      ]);
      mockGetWorldById.mockResolvedValueOnce(worldRow());
      mockPublishLessonRow.mockResolvedValueOnce(lessonRow({ status: "published" }));

      const result = await publishLesson(ACTOR, "lesson_1", META);

      expect(result.status).toBe("published");
    });

    // enable-all-formats branch: widened from just single_select - every
    // real format is app-renderable now, so a quiz-like lesson referencing
    // any one of them must publish cleanly.
    it.each(["ordering", "sort_buckets", "fill_blank", "match_pairs", "spot_mistake", "number_guess"])(
      "publishes when a quiz-like lesson references a %s question",
      async (format) => {
        mockGetLessonById.mockResolvedValueOnce(
          lessonRow({ kind: "quiz", content: { questionIds: ["11111111-1111-4111-8111-111111111111"] } }),
        );
        mockGetQuestionsByIds.mockResolvedValueOnce([
          { id: "11111111-1111-4111-8111-111111111111", status: "published", format },
        ]);
        mockGetWorldById.mockResolvedValueOnce(worldRow());
        mockPublishLessonRow.mockResolvedValueOnce(lessonRow({ status: "published" }));

        const result = await publishLesson(ACTOR, "lesson_1", META);

        expect(result.status).toBe("published");
      },
    );

    // App asks batch, section B. enable-all-formats branch: all 7 real
    // formats are app-renderable now (see the it.each above), so this gate
    // is exercised with a format outside the real enum - standing in for
    // whatever gets added next before the app ships a renderer for it.
    it("blocks publish when a quiz-like lesson references a question in an app-unrenderable format", async () => {
      mockGetLessonById.mockResolvedValueOnce(
        lessonRow({ kind: "quiz", content: { questionIds: ["11111111-1111-4111-8111-111111111111"] } }),
      );
      mockGetQuestionsByIds.mockResolvedValueOnce([
        { id: "11111111-1111-4111-8111-111111111111", status: "published", format: "not_a_real_format" },
      ]);

      await expect(publishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        details: {
          questionProblems: [
            'question 11111111-1111-4111-8111-111111111111 uses the "not_a_real_format" format, which the app doesn\'t support yet',
          ],
        },
      });
      expect(mockPublishLessonRow).not.toHaveBeenCalled();
    });
  });
});

describe("unpublishLesson", () => {
  it("unpublishes and logs it", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow());
    mockUnpublishLessonRow.mockResolvedValueOnce(lessonRow({ status: "draft" }));

    const result = await unpublishLesson(ACTOR, "lesson_1", META);

    expect(result.status).toBe("draft");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lesson.unpublished" }),
    );
  });

  it("throws NOT_FOUND for an unknown lesson", async () => {
    mockGetLessonById.mockResolvedValueOnce(null);

    await expect(unpublishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("throws CONFLICT when the lesson isn't published", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow());
    mockUnpublishLessonRow.mockResolvedValueOnce(null);

    await expect(unpublishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  // D23 (docs/ARCHITECTURE.md): a Boss Quiz can never be unpublished - it
  // gates every later world's unlock (worlds/service.ts's getPublicWorlds).
  it("blocks unpublishing a boss_quiz lesson, unconditionally", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ kind: "boss_quiz" }));

    await expect(unpublishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/Boss Quiz/i),
    });
    expect(mockUnpublishLessonRow).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("allows unpublishing every other kind (only boss_quiz is blocked)", async () => {
    for (const kind of ["video", "story", "quiz", "role_play", "doubt_zone"] as const) {
      mockGetLessonById.mockResolvedValueOnce(lessonRow({ kind }));
      mockUnpublishLessonRow.mockResolvedValueOnce(lessonRow({ kind, status: "draft" }));

      const result = await unpublishLesson(ACTOR, "lesson_1", META);

      expect(result.status).toBe("draft");
    }
  });
});

// D20/D23 (docs/ARCHITECTURE.md): direct edit of a PUBLISHED lesson's
// title/blurb/content, without unpublishing - the only fix path for a
// boss_quiz lesson.
describe("hotfixLesson", () => {
  const HOTFIX_INPUT = {
    id: "lesson_1",
    title: { en: "Fixed title", hi: "x", hx: "x" },
    blurb: { en: "Fixed blurb.", hi: "x", hx: "x" },
    content: { questionIds: ["11111111-1111-4111-8111-111111111111"] },
  };

  it("updates a published lesson and logs it", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ status: "published" }));
    mockHotfixLessonRow.mockResolvedValueOnce(lessonRow({ status: "published", ...HOTFIX_INPUT }));

    const result = await hotfixLesson(ACTOR, HOTFIX_INPUT, META);

    expect(result.title.en).toBe("Fixed title");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lesson.hotfixed", actorId: "staff_1" }),
    );
  });

  it("throws NOT_FOUND for an unknown lesson", async () => {
    mockGetLessonById.mockResolvedValueOnce(null);

    await expect(hotfixLesson(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockHotfixLessonRow).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when the lesson is a draft, not published", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ status: "draft" }));

    await expect(hotfixLesson(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(mockHotfixLessonRow).not.toHaveBeenCalled();
  });

  it("rejects content that doesn't match the lesson's own (immutable) kind", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ status: "published", kind: "video" }));

    await expect(
      hotfixLesson(ACTOR, { ...HOTFIX_INPUT, content: { questionIds: [] } }, META), // quiz-shaped, not video-shaped
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockHotfixLessonRow).not.toHaveBeenCalled();
  });

  it("rejects a fix that leaves a translation missing", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ status: "published" }));

    await expect(
      hotfixLesson(ACTOR, { ...HOTFIX_INPUT, title: { en: "Fixed", hi: "", hx: "Fixed" } }, META),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mockHotfixLessonRow).not.toHaveBeenCalled();
  });

  it("rejects a fix that introduces a dangling question reference (D18)", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ status: "published" }));
    mockGetQuestionsByIds.mockResolvedValueOnce([]); // the new reference doesn't exist

    await expect(hotfixLesson(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(mockHotfixLessonRow).not.toHaveBeenCalled();
  });

  // Confirms hotfixLesson truly shares validateLessonForPublish's video
  // cue-timing gate (not just translation completeness), same as
  // publishLesson's own "rejects a video cue that fires after the video
  // ends" test above.
  it("rejects a fix that puts a video cue out of order", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ status: "published", kind: "video" }));

    await expect(
      hotfixLesson(
        ACTOR,
        {
          ...HOTFIX_INPUT,
          content: {
            lengthSeconds: 48,
            scenes: [],
            cues: [
              { at: 20, questionId: "11111111-1111-4111-8111-111111111111", timerSeconds: 8 },
              { at: 10, questionId: "22222222-2222-4222-8222-222222222222", timerSeconds: 8 },
            ],
          },
        },
        META,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { structuralErrors: [expect.stringMatching(/out of order/)] },
    });
    expect(mockHotfixLessonRow).not.toHaveBeenCalled();
  });

  it("rejects a fix that has a video cue firing after the video ends", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ status: "published", kind: "video" }));

    await expect(
      hotfixLesson(
        ACTOR,
        {
          ...HOTFIX_INPUT,
          content: {
            lengthSeconds: 48,
            scenes: [],
            cues: [{ at: 60, questionId: "11111111-1111-4111-8111-111111111111", timerSeconds: 8 }],
          },
        },
        META,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { structuralErrors: [expect.stringMatching(/after the video ends/)] },
    });
    expect(mockHotfixLessonRow).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when the repo returns null (concurrently unpublished)", async () => {
    mockGetLessonById.mockResolvedValueOnce(lessonRow({ status: "published" }));
    mockHotfixLessonRow.mockResolvedValueOnce(null);

    await expect(hotfixLesson(ACTOR, HOTFIX_INPUT, META)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("getLessonEditorData", () => {
  it("returns every lesson in the world regardless of status, with its in-progress learner count from one grouped query", async () => {
    mockListAllLessonsForWorld.mockResolvedValueOnce([lessonRow(), lessonRow({ id: "lesson_2" })]);
    mockCountInProgressLearnersByLessonIds.mockResolvedValueOnce(new Map([["lesson_1", 3]]));

    const result = await getLessonEditorData(WORLD_ID);

    expect(result).toHaveLength(2);
    expect(mockListAllLessonsForWorld).toHaveBeenCalledWith(WORLD_ID);
    expect(mockCountInProgressLearnersByLessonIds).toHaveBeenCalledWith(["lesson_1", "lesson_2"]);
    expect(result[0]!.inProgressLearnerCount).toBe(3);
    expect(result[1]!.inProgressLearnerCount).toBe(0); // missing from the map - defaults to 0
  });
});

describe("listPublishedLessonsReferencingQuestion", () => {
  const TARGET_QID = "11111111-1111-4111-8111-111111111111";
  const OTHER_QID = "22222222-2222-4222-8222-222222222222";

  it("returns only published lessons whose content references the given question id", async () => {
    const referencing = lessonRow({
      id: "lesson_referencing",
      kind: "quiz",
      content: { questionIds: [TARGET_QID] },
    });
    const notReferencing = lessonRow({
      id: "lesson_not_referencing",
      kind: "quiz",
      content: { questionIds: [OTHER_QID] },
    });
    mockListAllPublishedLessons.mockResolvedValueOnce([referencing, notReferencing]);

    const result = await listPublishedLessonsReferencingQuestion(TARGET_QID);

    expect(result.map((l) => l.id)).toEqual(["lesson_referencing"]);
  });

  it("also matches a video lesson's in-video cue referencing the question", async () => {
    const referencing = lessonRow({
      id: "lesson_video",
      kind: "video",
      content: {
        lengthSeconds: 48,
        scenes: [],
        cues: [{ at: 10, questionId: TARGET_QID, timerSeconds: 8 }],
      },
    });
    mockListAllPublishedLessons.mockResolvedValueOnce([referencing]);

    const result = await listPublishedLessonsReferencingQuestion(TARGET_QID);

    expect(result.map((l) => l.id)).toEqual(["lesson_video"]);
  });

  it("returns an empty array when no published lesson references the question", async () => {
    mockListAllPublishedLessons.mockResolvedValueOnce([
      lessonRow({ content: { questionIds: [OTHER_QID] } }),
    ]);

    const result = await listPublishedLessonsReferencingQuestion(TARGET_QID);

    expect(result).toEqual([]);
  });
});

describe("getLessonPreview", () => {
  it("returns the same answer-free projection as getPublicLesson, for a draft the public endpoint can't see", async () => {
    const draft = lessonRow({ status: "draft" });
    mockGetLessonById.mockResolvedValueOnce(draft);
    mockGetPublishedLesson.mockResolvedValueOnce(null); // the public repo call finds nothing - it's a draft

    const preview = await getLessonPreview("lesson_1");
    await expect(getPublicLesson("lesson_1", LEARNER_ID)).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(preview).toEqual({
      id: "lesson_1",
      worldId: WORLD_ID,
      chapter: 1,
      step: 1,
      kind: "quiz",
      title: draft.title,
      blurb: draft.blurb,
      content: draft.content,
    });
    // Exactly the fields getPublicLesson would return for the same row once
    // published - no `status`/`publishedAt`/`publishedBy` leaking through.
    expect(Object.keys(preview).sort()).toEqual(
      ["id", "worldId", "chapter", "step", "kind", "title", "blurb", "content"].sort(),
    );
  });

  it("throws NOT_FOUND for an unknown lesson id", async () => {
    mockGetLessonById.mockResolvedValueOnce(null);

    await expect(getLessonPreview("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
