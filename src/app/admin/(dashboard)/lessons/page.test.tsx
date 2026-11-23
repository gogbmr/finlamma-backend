// Same convention as worlds/page.test.tsx - a Server Component is just an
// async function returning a React element tree, not something rendered to
// a DOM.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockGetPermissionKeysForRole = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  getPermissionKeysForRole: (roleId: unknown) => mockGetPermissionKeysForRole(roleId),
}));

const mockGetWorldEditorData = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  getWorldEditorData: () => mockGetWorldEditorData(),
}));

const mockGetLessonEditorData = vi.fn();
vi.mock("@/server/lessons/service", () => ({
  getLessonEditorData: (worldId: unknown) => mockGetLessonEditorData(worldId),
}));

vi.mock("./lessons-filter-bar", () => ({
  ALL_WORLDS: "all",
  LessonsFilterBar: () => null,
}));
vi.mock("./lessons-table", () => ({ LessonsTable: () => null }));

import LessonsPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

function world(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "world_1",
    order: 1,
    code: "MW",
    title: { en: "Money World", hi: "a", hx: "a" },
    mentorId: "mentor_1",
    status: "published",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockGetPermissionKeysForRole.mockResolvedValue(
    new Set(["lesson.view", "lesson.create", "lesson.edit", "lesson.delete"]),
  );
  mockGetWorldEditorData.mockResolvedValue([world()]);
  mockGetLessonEditorData.mockResolvedValue([]);
});

describe("LessonsPage", () => {
  it("shows Forbidden when the staff member lacks lesson.view", async () => {
    mockGetPermissionKeysForRole.mockResolvedValue(new Set());

    const result = await LessonsPage({ searchParams: Promise.resolve({}) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("fetches lessons for only the selected world by default", async () => {
    await LessonsPage({ searchParams: Promise.resolve({}) });

    expect(mockGetLessonEditorData).toHaveBeenCalledTimes(1);
    expect(mockGetLessonEditorData).toHaveBeenCalledWith("world_1");
  });

  // "All worlds" (Task: world dropdown filter) fetches every world's
  // lessons via runWithConcurrencyLimit, not a bare Promise.all (CLAUDE.md
  // rule 15, docs/ARCHITECTURE.md D13/D72).
  it("fetches every world's lessons when worldId=all", async () => {
    mockGetWorldEditorData.mockResolvedValue([world({ id: "world_1" }), world({ id: "world_2" })]);

    await LessonsPage({ searchParams: Promise.resolve({ worldId: "all" }) });

    expect(mockGetLessonEditorData).toHaveBeenCalledTimes(2);
    expect(mockGetLessonEditorData).toHaveBeenCalledWith("world_1");
    expect(mockGetLessonEditorData).toHaveBeenCalledWith("world_2");
  });
});
