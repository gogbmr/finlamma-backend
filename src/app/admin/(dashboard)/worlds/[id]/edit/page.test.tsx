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

const mockGetMentorEditorData = vi.fn();
vi.mock("@/server/mentors/service", () => ({
  getMentorEditorData: () => mockGetMentorEditorData(),
}));

const mockGetLessonEditorData = vi.fn();
vi.mock("@/server/lessons/service", () => ({
  getLessonEditorData: (worldId: unknown) => mockGetLessonEditorData(worldId),
}));

const mockGetWorldEditorData = vi.fn();
vi.mock("@/server/worlds/service", () => ({
  getWorldEditorData: () => mockGetWorldEditorData(),
}));

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));

vi.mock("../../world-editor", () => ({ WorldForm: () => null }));

import EditWorldPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

function world(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "world_1",
    order: 1,
    code: "MW",
    title: { en: "Money World", hi: "a", hx: "a" },
    tagline: { en: "a", hi: "a", hx: "a" },
    theme: "#7C3AED",
    displayXpTarget: 1000,
    mentorId: "mentor_1",
    status: "published",
    artUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStaffMember.mockResolvedValue(STAFF);
  mockGetPermissionKeysForRole.mockResolvedValue(
    new Set(["world.view", "world.create", "world.edit", "world.delete"]),
  );
  mockGetMentorEditorData.mockResolvedValue([]);
  mockGetLessonEditorData.mockResolvedValue([]);
  mockGetWorldEditorData.mockResolvedValue([world()]);
});

describe("EditWorldPage", () => {
  it("shows Forbidden when signed out", async () => {
    mockGetStaffMember.mockResolvedValue(null);

    const result = await EditWorldPage({ params: Promise.resolve({ id: "world_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/sign-in/i);
  });

  it("shows Forbidden when the staff member has neither world.edit nor world.delete", async () => {
    mockGetPermissionKeysForRole.mockResolvedValue(new Set());

    const result = await EditWorldPage({ params: Promise.resolve({ id: "world_1" }) });

    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  it("calls notFound for an id that doesn't match any world", async () => {
    await expect(
      EditWorldPage({ params: Promise.resolve({ id: "does-not-exist" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  // Replaces the old worlds/page.test.tsx coverage for this - fetching
  // Doubt Zone lessons for the mentor-change warning (docs/ARCHITECTURE.md
  // D19) now happens once, for just the one world being edited, since
  // editing moved off the paginated list page onto its own per-world page.
  it("fetches Doubt Zone lessons for exactly this world, not every world", async () => {
    mockGetWorldEditorData.mockResolvedValue([world({ id: "world_1" }), world({ id: "world_2" })]);
    mockGetLessonEditorData.mockResolvedValue([
      { id: "lesson_1", kind: "doubt_zone", title: { en: "DZ" }, content: { mentorKey: "baby_lamma" } },
    ]);

    await EditWorldPage({ params: Promise.resolve({ id: "world_1" }) });

    expect(mockGetLessonEditorData).toHaveBeenCalledTimes(1);
    expect(mockGetLessonEditorData).toHaveBeenCalledWith("world_1");
  });
});
