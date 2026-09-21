import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLessonById = vi.fn();
const mockGetPublishedLesson = vi.fn();
const mockGetPublishedLessonAtPosition = vi.fn();
const mockInsertDraftLesson = vi.fn();
const mockListAllLessonsForWorld = vi.fn();
const mockListPublishedLessonsForWorld = vi.fn();
const mockPublishLessonRow = vi.fn();
const mockUnpublishLessonRow = vi.fn();
const mockUpdateDraftLesson = vi.fn();
vi.mock("./repo", () => ({
  getLessonById: (id: unknown) => mockGetLessonById(id),
  getPublishedLesson: (id: unknown) => mockGetPublishedLesson(id),
  getPublishedLessonAtPosition: (worldId: unknown, chapter: unknown, step: unknown) =>
    mockGetPublishedLessonAtPosition(worldId, chapter, step),
  insertDraftLesson: (input: unknown) => mockInsertDraftLesson(input),
  listAllLessonsForWorld: (worldId: unknown) => mockListAllLessonsForWorld(worldId),
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

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-log", () => ({
  logActivity: (input: unknown) => mockLogActivity(input),
}));

import {
  createLessonDraft,
  getCurrentLesson,
  getLessonEditorData,
  getPublicLesson,
  getPublicLessonsForWorld,
  publishLesson,
  unpublishLesson,
  updateLessonDraft,
} from "./service";

const META = { ip: "1.2.3.4", userAgent: "test-agent" };
const ACTOR = { id: "staff_1" };
const WORLD_ID = "world_1";

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
});

describe("getPublicLessonsForWorld / getPublicLesson", () => {
  it("maps published lessons to the summary shape (no content field)", async () => {
    mockListPublishedLessonsForWorld.mockResolvedValueOnce([lessonRow()]);

    const result = await getPublicLessonsForWorld(WORLD_ID);

    expect(result).toEqual([
      {
        id: "lesson_1",
        chapter: 1,
        step: 1,
        kind: "quiz",
        title: lessonRow().title,
        blurb: lessonRow().blurb,
      },
    ]);
    expect(result[0]).not.toHaveProperty("content");
  });

  it("maps a single published lesson to the full detail shape", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(lessonRow());

    const result = await getPublicLesson("lesson_1");

    expect(result).toEqual({
      id: "lesson_1",
      worldId: WORLD_ID,
      chapter: 1,
      step: 1,
      kind: "quiz",
      title: lessonRow().title,
      blurb: lessonRow().blurb,
      content: lessonRow().content,
    });
  });

  it("throws NOT_FOUND for an unknown/unpublished lesson id", async () => {
    mockGetPublishedLesson.mockResolvedValueOnce(null);

    await expect(getPublicLesson("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
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

      const summaryList = await getPublicLessonsForWorld(WORLD_ID);
      const detail = await getPublicLesson(row.id);

      expect(JSON.stringify(summaryList)).not.toMatch(/"answer"/i);
      expect(JSON.stringify(detail)).not.toMatch(/"answer"/i);
    }
  });
});

describe("getCurrentLesson", () => {
  it("returns chapter 1/step 1 of the lowest-order published world", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
    mockGetPublishedLessonAtPosition.mockResolvedValueOnce(lessonRow());

    const result = await getCurrentLesson();

    expect(mockGetPublishedLessonAtPosition).toHaveBeenCalledWith(WORLD_ID, 1, 1);
    expect(result.id).toBe("lesson_1");
  });

  it("throws NOT_FOUND when there are no published worlds", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce([]);

    await expect(getCurrentLesson()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockGetPublishedLessonAtPosition).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the world has no lesson at chapter 1/step 1 yet", async () => {
    mockListPublishedWorlds.mockResolvedValueOnce([worldRow()]);
    mockGetPublishedLessonAtPosition.mockResolvedValueOnce(null);

    await expect(getCurrentLesson()).rejects.toMatchObject({ code: "NOT_FOUND" });
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
});

describe("unpublishLesson", () => {
  it("unpublishes and logs it", async () => {
    mockUnpublishLessonRow.mockResolvedValueOnce(lessonRow({ status: "draft" }));

    const result = await unpublishLesson(ACTOR, "lesson_1", META);

    expect(result.status).toBe("draft");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lesson.unpublished" }),
    );
  });

  it("throws CONFLICT when the lesson isn't published", async () => {
    mockUnpublishLessonRow.mockResolvedValueOnce(null);

    await expect(unpublishLesson(ACTOR, "lesson_1", META)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("getLessonEditorData", () => {
  it("returns every lesson in the world regardless of status", async () => {
    mockListAllLessonsForWorld.mockResolvedValueOnce([lessonRow(), lessonRow({ id: "lesson_2" })]);

    const result = await getLessonEditorData(WORLD_ID);

    expect(result).toHaveLength(2);
    expect(mockListAllLessonsForWorld).toHaveBeenCalledWith(WORLD_ID);
  });
});
