// WorldsPage is a Server Component - just an async function returning a
// React element tree, not something rendered to a DOM - same pattern
// src/app/admin/(dashboard)/settings/page.test.tsx already uses.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetStaffMember = vi.fn();
vi.mock("@/lib/auth", () => ({ getStaffMember: () => mockGetStaffMember() }));

const mockRoleHasPermission = vi.fn();
vi.mock("@/server/staff/repo", () => ({
  roleHasPermission: (roleId: unknown, permission: unknown) => mockRoleHasPermission(roleId, permission),
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

// Dependency-free stub, same convention settings/page.test.tsx uses - this
// test only cares about what data reaches it, not how it renders.
vi.mock("./world-editor", () => ({ WorldEditor: () => null }));

import WorldsPage from "./page";

const STAFF = { id: "staff_1", roleId: "role_1" };

function world(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "world_1",
    order: 1,
    code: "MW",
    title: { en: "Money World", hi: "a", hx: "a" },
    tagline: { en: "a", hi: "a", hx: "a" },
    theme: "blue",
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
  mockRoleHasPermission.mockResolvedValue(true);
  mockGetMentorEditorData.mockResolvedValue([]);
  mockGetLessonEditorData.mockResolvedValue([]);
});

describe("WorldsPage", () => {
  it("shows Forbidden when the staff member has neither world.manage nor world.publish", async () => {
    mockRoleHasPermission.mockResolvedValue(false);
    mockGetWorldEditorData.mockResolvedValue([world()]);

    const result = await WorldsPage();

    expect(mockGetLessonEditorData).not.toHaveBeenCalled();
    expect((result as { props?: { message?: string } }).props?.message).toMatch(/permission/i);
  });

  // Phase 4 Trade audit's concurrency sweep: this used to be a bare
  // Promise.all(worlds.map(getLessonEditorData)) - a real DB-concurrency
  // risk as the world catalog grows (D25: no fixed count). Now
  // runWithConcurrencyLimit - this proves the fix still fetches every
  // world's lessons correctly, not just that it compiles.
  it("fetches every world's lessons, even across several worlds", async () => {
    mockGetWorldEditorData.mockResolvedValue([
      world({ id: "world_1" }),
      world({ id: "world_2" }),
      world({ id: "world_3" }),
    ]);
    mockGetLessonEditorData.mockImplementation((worldId: string) =>
      Promise.resolve(
        worldId === "world_2"
          ? [{ id: "lesson_1", kind: "doubt_zone", title: { en: "DZ" }, content: { mentorKey: "baby_lamma" } }]
          : [],
      ),
    );

    await WorldsPage();

    expect(mockGetLessonEditorData).toHaveBeenCalledTimes(3);
    expect(mockGetLessonEditorData).toHaveBeenCalledWith("world_1");
    expect(mockGetLessonEditorData).toHaveBeenCalledWith("world_2");
    expect(mockGetLessonEditorData).toHaveBeenCalledWith("world_3");
  });
});
