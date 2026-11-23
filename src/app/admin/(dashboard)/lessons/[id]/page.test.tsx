// Same convention as worlds/[id]/page.test.tsx - a Server Component is
// just an async function returning a React element tree, not something
// rendered to a DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockGetPermissionKeysForRole = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  getPermissionKeysForRole: (roleId: unknown) => mockGetPermissionKeysForRole(roleId),
}));

const mockFindLessonById = vi.fn();
vi.mock("../find-lesson", () => ({
  findLessonById: (id: unknown) => mockFindLessonById(id),
}));

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));

vi.mock("../lesson-view", () => ({ LessonView: () => null }));

import LessonViewPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };
const LESSON = {
  id: "lesson_1",
  worldId: "world_1",
  chapter: 1,
  step: 1,
  kind: "video",
  title: { en: "Intro to Money", hi: "a", hx: "a" },
  blurb: { en: "x", hi: "a", hx: "a" },
  content: {},
  status: "draft" as const,
  inProgressLearnerCount: 0,
};
const WORLD = { id: "world_1", order: 1, title: { en: "Money World", hi: "a", hx: "a" }, mentorId: "mentor_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockGetPermissionKeysForRole.mockResolvedValue(
    new Set(["lesson.view", "lesson.create", "lesson.edit", "lesson.delete"]),
  );
  mockFindLessonById.mockResolvedValue({ lesson: LESSON, world: WORLD });
});

describe("LessonViewPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await LessonViewPage({ params: Promise.resolve({ id: "lesson_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden when the staff member lacks lesson.view", async () => {
    mockGetPermissionKeysForRole.mockResolvedValue(new Set());

    const result = await LessonViewPage({ params: Promise.resolve({ id: "lesson_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("calls notFound for an id that doesn't match any lesson", async () => {
    mockFindLessonById.mockResolvedValue(null);

    await expect(
      LessonViewPage({ params: Promise.resolve({ id: "does-not-exist" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("resolves the matching lesson and its world for a valid id", async () => {
    await LessonViewPage({ params: Promise.resolve({ id: "lesson_1" }) });

    expect(mockFindLessonById).toHaveBeenCalledWith("lesson_1");
  });
});
