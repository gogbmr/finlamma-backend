import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetWorldEditorData = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  getWorldEditorData: () => mockGetWorldEditorData(),
}));

const mockGetLessonEditorData = vi.fn();
vi.mock("@/server/lessons/service", () => ({
  getLessonEditorData: (worldId: unknown) => mockGetLessonEditorData(worldId),
}));

import { findLessonById } from "./find-lesson";

function world(id: string, order: number) {
  return { id, order, title: { en: `World ${order}`, hi: "a", hx: "a" }, mentorId: "mentor_1" };
}

function lesson(id: string) {
  return {
    id,
    chapter: 1,
    step: 1,
    kind: "video",
    title: { en: "Lesson", hi: "a", hx: "a" },
    blurb: { en: "x", hi: "a", hx: "a" },
    content: {},
    status: "draft" as const,
    inProgressLearnerCount: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findLessonById", () => {
  it("finds a lesson in whichever world it actually belongs to, not just the first", async () => {
    mockGetWorldEditorData.mockResolvedValue([world("world_1", 1), world("world_2", 2)]);
    mockGetLessonEditorData.mockImplementation((worldId: string) =>
      Promise.resolve(worldId === "world_2" ? [lesson("lesson_1")] : []),
    );

    const result = await findLessonById("lesson_1");

    expect(result?.lesson.id).toBe("lesson_1");
    expect(result?.world.id).toBe("world_2");
  });

  it("returns null when no world has a lesson with that id", async () => {
    mockGetWorldEditorData.mockResolvedValue([world("world_1", 1)]);
    mockGetLessonEditorData.mockResolvedValue([]);

    const result = await findLessonById("does-not-exist");

    expect(result).toBeNull();
  });
});
